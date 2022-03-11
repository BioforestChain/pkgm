import {
  BuildService,
  consts,
  createTscLogger,
  Debug,
  doBuild,
  doDev,
  getBfspUserConfig,
  getBfswVersion,
  getTui,
  installBuildDeps,
  runTsc,
  runYarn,
  Tasks,
  watchBfspProjectConfig,
  watchDeps,
  writeBfspProjectConfig,
  writeBuildConfigs,
  writeJsonConfig,
} from "@bfchain/pkgm-bfsp";
import chalk from "chalk";
import { DepGraph } from "dependency-graph";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { createSymlink, getBfswBuildService } from "../src/buildService";
import { ParallelRunner } from "../src/util";
import {
  CbArgsForAllTs,
  CbArgsForAllUserConfig,
  getValidProjects,
  registerAllTsEvent,
  registerAllUserConfigEvent,
  states,
  watchWorkspace,
} from "../src/watcher";

const log = Debug("workspace");

let root = "";
let appWatcher: ReturnType<typeof watchWorkspace>;
let bfswBuildService: BuildService | undefined;
type DevTask = Awaited<ReturnType<typeof runDevTask>>;
const runableDevTasks: Map<string, DevTask> = new Map();
const pendingTasks = new Tasks<string>();

let tscClosable: ReturnType<typeof runTsc> | undefined;
const dg = new DepGraph();

async function updateWorkspaceTsConfig() {
  const tsConfig = {
    compilerOptions: {
      composite: true,
      noEmit: true,
      declaration: true,
      sourceMap: false,
      target: "es2020",
      module: "es2020",
      lib: ["ES2020"],
      importHelpers: true,
      isolatedModules: false,
      strict: true,
      noImplicitAny: true,
      strictNullChecks: true,
      strictFunctionTypes: true,
      strictBindCallApply: true,
      strictPropertyInitialization: true,
      noImplicitThis: true,
      alwaysStrict: true,
      moduleResolution: "node",
      resolveJsonModule: true,
      // baseUrl: "./",
      // types: ["node"],
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
    },
    references: [...states.paths()].flatMap((x) => {
      return [
        {
          path: path.join(x, `tsconfig.isolated.json`),
        },
      ];
    }),
    // files: tsFilesLists.notestFiles.toArray(),
    files: [],
  };
  await writeJsonConfig(path.join(root, "tsconfig.json"), tsConfig);
}
async function updatePackageJson() {
  const bfswVersion = getBfswVersion();

  // const buildDeps = {} as { [index: string]: string };
  // for (const cfg of states.userConfigs()) {
  //   cfg.build?.forEach((x) => {
  //     const p = path.join(cfg.name, "build", x.name!);
  //     if (!existsSync(p)) {
  //       mkdirSync(p, { recursive: true });
  //     }
  //     buildDeps[x.name!] = `${toPosixPath(p)}`;
  //   });
  // }

  const packageJson = {
    name: "bfsp-workspace",
    private: true,
    packageManager: "yarn@1.22.0",
    workspaces: [...states.paths()],
    devDependencies: {
      "@bfchain/pkgm-bfsw": `${bfswVersion}`,
    },
    // dependencies: {
    //   ...buildDeps,
    // },
  };
  await writeJsonConfig(path.join(root, `package.json`), packageJson);
}
const oldCfgDeps = new Map<string, string[] | undefined>();
async function handleBfspWatcherEvent(args: CbArgsForAllUserConfig) {
  const { type, cfg } = args;

  /// 构建依赖关系
  if (type === "unlink") {
    dg.removeNode(cfg.name);
  } else {
    dg.addNode(cfg.name);
    const oldDeps = oldCfgDeps.get(cfg.name);
    const newDeps = cfg.deps;
    oldCfgDeps.set(cfg.name, newDeps);
    oldDeps?.forEach((dep) => {
      dg.removeDependency(cfg.name, dep);
    });
    cfg.deps?.forEach((dep) => {
      dg.addNode(dep);
      dg.addDependency(cfg.name, dep);
    });
  }
  pendingTasks.useOrder(dg.overallOrder());

  if (type !== "change") {
    // 新增删除都需要更新根tsconfig.json
    await updateWorkspaceTsConfig();
  }

  await updatePackageJson();
  if (!runableDevTasks.has(cfg.name)) {
    const task = await runDevTask({ root: args.path });
    runableDevTasks.set(cfg.name, task);
  }

  // 重启tsc，@FIXME: 等待 https://github.com/microsoft/TypeScript/issues/47799 修复
  // 如果这个问题修复了，那么需要在启动的时候跑一次tsc
  if (type !== "change") {
    tscClosable && tscClosable.stop();
    runRootTsc();
  }
}
async function handleTsWatcherEvent(args: CbArgsForAllTs) {
  const { type, name } = args;

  // rollup watcher运行结束关闭后，ts文件修改，将项目添加到watcher队列
  if (type === "change") {
    pendingTasks.add(name);
  }
}
function runRootTsc() {
  const tsconfigPath = path.join(root, "tsconfig.json");
  if (!existsSync(tsconfigPath)) {
    setTimeout(() => runRootTsc(), 1000);
  } else {
    const logger = createTscLogger();
    tscClosable = runTsc({
      tsconfigPath,
      watch: true,
      onSuccess: () => {},
      onClear: () => logger.clear(),
      onMessage: (s) => logger.write(s),
    });
  }
}

class DepInstaller {
  private _map: Map<string, () => BFChainUtil.PromiseMaybe<void>> = new Map();
  private _pendingDeps = false; // 是否还有未执行的‘依赖安装’动作
  private _closable: ReturnType<typeof runYarn> | undefined;
  private _allDoneCbs: (() => BFChainUtil.PromiseMaybe<void>)[] = [];
  onAllDone(cb: () => BFChainUtil.PromiseMaybe<void>) {
    this._allDoneCbs.push(cb);
  }
  add(opts: { name: string; onDone: () => BFChainUtil.PromiseMaybe<void> }) {
    this._pendingDeps = true;
    if (this._map.has(opts.name)) {
      return;
    }
    this._map.set(opts.name, opts.onDone);
    if (!this._closable) {
      this._runRootYarn();
    }
  }
  private _runRootYarn() {
    if (this._closable) {
      return;
    }
    const depsPanel = getTui().getPanel("Deps");
    depsPanel.updateStatus("loading");
    this._closable = runYarn({
      root,
      onMessage: (s) => depsPanel.write(s),
      onExit: () => {
        depsPanel.updateStatus("success");
        if (this._pendingDeps) {
          this._pendingDeps = false;
          this._closable = undefined;
          this._runRootYarn();
        } else {
          // 所有依赖都安装完成，触发map里的回调
          this._closable = undefined;
          this._allDoneCbs.forEach(async (cb) => {
            await cb();
          });
          this._map.forEach(async (cb, name) => {
            log(`dep done: ${name}`);
            await cb();
          });
        }
      },
    });
  }
}

function rootTscCompilation() {
  return new Promise((resolve) => {
    const logger = createTscLogger();
    const closable = runTsc({
      tsconfigPath: path.join(root, "tsconfig.json"),
      watch: true,
      onSuccess: () => {
        closable.stop();
        resolve(true);
      },
      onClear: () => logger.clear(),
      onMessage: (s) => logger.write(s),
    });
  });
}

async function createAllSymlink() {
  const p = getTui().getPanel("Deps");
  let hasWarning = false;

  const doCreateSymlink = async (name: string, outDir: string) => {
    if (!existsSync(outDir)) {
      hasWarning = true;
      p.write(chalk.yellow(`missing build dep: ${chalk.blue(name)}`));
      return false;
    }
    try {
      await createSymlink(root, name, outDir);
    } catch (e) {
      p.write(`${e}`);
    }
    return true;
  };
  for (const s of states.states()) {
    // @TODO: 从@bfchain/pkgm-bfsp导出构建outDir的函数
    const outDir = path.join(root, s.path, consts.BuildOutRootPath);

    if (s.userConfig.build) {
      for (const buildConfig of s.userConfig.build) {
        const buildOutDir = path.join(outDir, buildConfig.name!);
        if (!(await doCreateSymlink(buildConfig.name!, buildOutDir))) {
          continue;
        }
      }
    }
  }
  if (hasWarning) {
    p.updateStatus("warn");
  }
}
const depInstaller = new DepInstaller();
async function runDevTask(options: { root: string }) {
  const p = path.join(root, options.root);
  const buildService = bfswBuildService!;
  const bfspUserConfig = await getBfspUserConfig(p);
  const projectConfig = { projectDirpath: p, bfspUserConfig };
  const subConfigs = await writeBfspProjectConfig(projectConfig, buildService);
  const subStreams = watchBfspProjectConfig(projectConfig, buildService, subConfigs);
  const depStream = watchDeps(p, subStreams.packageJsonStream, { runYarn: false });

  const task = await doDev({
    root: p,
    buildService,
    subStreams,
  });

  /// 开始监听并触发编译
  subStreams.userConfigStream.onNext(() => pendingTasks.add(bfspUserConfig.userConfig.name));
  subStreams.viteConfigStream.onNext(() => pendingTasks.add(bfspUserConfig.userConfig.name));
  subStreams.tsConfigStream.onNext(() => pendingTasks.add(bfspUserConfig.userConfig.name));
  depStream.onNext(async () => {
    depInstaller.add({
      name: bfspUserConfig.userConfig.name,
      onDone: async () => {
        pendingTasks.add(bfspUserConfig.userConfig.name);
      },
    });
  });
  if (subStreams.viteConfigStream.hasCurrent()) {
    pendingTasks.add(bfspUserConfig.userConfig.name);
  }
  return task;
}

class RunningDevTasks {
  private _tasks = new Set<DevTask>();
  /**关闭很久没有执行的任务 */
  deleteOld(max: number) {
    if (max <= this._tasks.size) {
      for (const oldTask of this._tasks) {
        this._tasks.delete(oldTask);
        oldTask.abortable.close();
        break;
      }
    }
  }
  /**
   * 将刚刚执行的任务塞到末尾
   */
  addNew(task: DevTask) {
    this._tasks.delete(task);
    this._tasks.add(task);
  }
}

export async function workspaceInit(options: { root: string; mode: "dev" | "build" | "npm"; watcherLimit?: number }) {
  root = options.root;

  appWatcher = watchWorkspace({ root });
  bfswBuildService = getBfswBuildService(await appWatcher, options.mode === "npm");

  if (options.mode === "dev") {
    registerAllUserConfigEvent((args) => handleBfspWatcherEvent(args));
    registerAllTsEvent(handleTsWatcherEvent);
    depInstaller.onAllDone(async () => {
      // 其实build的最后一步都会做一下软链接，但为啥这里还要做一遍的原因是
      // 怀疑yarn在安装完依赖后，会删除软链接，这样如果有些包依赖了profile相关的包
      // tsc就无法通过验证，就要在所有依赖安装完成后重新创建一遍
      await createAllSymlink();
    });
    // runRootTsc();
    const watcherLimit = Math.max(1, Math.min(options.watcherLimit ?? 1, os.cpus().length - 1));
    const runningDevTasks = new RunningDevTasks();

    const bundlePanel = getTui().getPanel("Bundle");
    for await (const taskSignal of ParallelRunner(watcherLimit)) {
      const userConfigName = await pendingTasks.next();

      const task = runableDevTasks.get(userConfigName);
      if (task) {
        runningDevTasks.deleteOld(watcherLimit);
        task.abortable.start();
        bundlePanel.updateStatus("loading");
        runningDevTasks.addNew(task);

        task.onSuccess((name) => {
          log(`vite rollup ${name} watcher end!`);
          taskSignal.resolve();
          if (pendingTasks.hasRemaining() === false) {
            bundlePanel.updateStatus("success");
          }
        });
      } else {
        taskSignal.resolve();
      }
    }
  } else {
    const map = new Map<string, Awaited<ReturnType<typeof writeBuildConfigs>>>();
    const projects = getValidProjects();
    for (const p of projects) {
      const cfgs = await writeBuildConfigs({ root: path.join(root, p.path), buildService: bfswBuildService });
      map.set(p.name, cfgs);
    }

    await updatePackageJson();

    await installBuildDeps({ root }); // 等待依赖安装完成

    await updateWorkspaceTsConfig(); // 生成项目根目录tsconfig

    await rootTscCompilation(); // 等待tsc编译成功

    map.forEach((v, k) => {
      const cfg = v.bfspUserConfig.userConfig;
      dg.addNode(cfg.name);
      cfg.deps?.map((x) => {
        dg.addNode(x);
        dg.addDependency(cfg.name, x);
      });
    });

    /// run build tasks
    for (const name of dg.overallOrder()) {
      const s = states.findByName(name);
      if (s) {
        await doBuild({ root: path.join(root, s.path), buildService: bfswBuildService!, cfgs: map.get(name)! });
      }
    }
    getTui().status.postMsg("all build tasks finished");
  }
}
