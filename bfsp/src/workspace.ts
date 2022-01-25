import chokidar from "chokidar";
import { existsSync } from "node:fs";
import os from "node:os";
import path, { resolve } from "node:path";
import { Closeable, notGitIgnored, readUserConfig, readWorkspaceConfig, walkFiles } from ".";
import { workspaceItemDoDev } from "../bin/multi/dev.core";
import { runTsc } from "../bin/tsc/runner";
import { getPkgmVersion, Tasks, writeJsonConfig } from "../bin/util";
import { BuildService, getBfswBuildService } from "./core";
import { watchWorkspace, states, registerAllUserConfigEvent, CbArgsForAllUserConfig } from "./watcher";
import { DepGraph } from "dependency-graph";
import { createTscLogger } from "./logger";
import { getTui } from "./tui";

let root = "";
let appWatcher: ReturnType<typeof watchWorkspace>;
let bfswBuildService: BuildService | undefined;
let runningTasks: Map<string, ReturnType<typeof Closeable>> = new Map();
const pendingTasks = new Tasks<string>();
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
    references: [...states.paths()].map((x) => ({ path: path.join(x, `tsconfig.json`) })),
    // files: tsFilesLists.notestFiles.toArray(),
    files: [] as string[],
  };
  await writeJsonConfig(path.join(root, "tsconfig.json"), tsConfig);
}
async function updatePackageJson() {
  const pkgmVersion = getPkgmVersion();

  const packageJson = {
    name: "bfsp-workspace",
    private: true,
    workspaces: [...states.paths()],
    devDependencies: {
      "@bfchain/pkgm": `^${pkgmVersion}`,
    },
  };
  await writeJsonConfig(path.join(root, `package.json`), packageJson);
}

async function handleBfspWatcherEvent(args: CbArgsForAllUserConfig) {
  const { type, cfg } = args;
  if (type === "unlink") {
    dg.removeNode(cfg.name);
  }
  dg.addNode(cfg.name);
  cfg.deps?.map((x) => {
    dg.addNode(x);
    dg.addDependency(cfg.name, x);
  });
  if (type !== "change") {
    // 新增删除都需要更新根tsconfig.json
    await updateWorkspaceTsConfig();
  }
  await updatePackageJson();
  if (!runningTasks.has(cfg.name)) {
    pendingTasks.add(cfg.name);
  }
}
function runRootTsc() {
  const tsconfigPath = path.join(root, "tsconfig.json");
  if (!existsSync(tsconfigPath)) {
    setTimeout(() => runRootTsc(), 1000);
  } else {
    const logger = createTscLogger();
    runTsc({
      tsconfigPath,
      watch: true,
      onSuccess: () => {},
      onClear: () => logger.clear(),
      onMessage: (s) => logger.write(s),
    });
  }
}
export async function workspaceInit(options: { root: string; mode: "dev" | "build", watcherLimit?: number }) {
  root = options.root;
  registerAllUserConfigEvent(handleBfspWatcherEvent);
  runRootTsc();
  appWatcher = watchWorkspace({ root });
  bfswBuildService = getBfswBuildService(appWatcher);

  if(options.mode === "dev") {
    let watcherLimit = options.watcherLimit;
    const cpus = os.cpus().length;

    if(watcherLimit === undefined || watcherLimit < 1) {
      watcherLimit = cpus - 1 >= 1 ? (cpus - 1) : 1;
    }

    const taskSerial = new TaskSerial(watcherLimit);
    taskSerial.runTask();
    taskSerial.addRollupWatcher();
  } else {
    await runTasks();
  }

  // TODO: 多项目模式下的依赖管理，考虑拦截deps流之后在这里做依赖安装
}
const { status } = getTui();
async function runTasks() {
  const name = pendingTasks.next();
  if (name) {
    const state = states.findByName(name);
    if (state) {
      const resolvedDir = path.join(root, state.path);

      status.postMsg(`compiling ${name}`);
      const closable = await workspaceItemDoDev({ root: resolvedDir, buildService: bfswBuildService! });
      runningTasks.set(state.userConfig.name, closable);
      status.postMsg(`${name} compilation finished`);
      
      // TODO: build task
    }
  }
  setTimeout(async () => {
    await runTasks();
  }, 1000);
}

// 任务串行化
export class TaskSerial {
  public static activeWatcherNums: number = 0;
  public static queue = [] as string[];

  constructor(public watcherLimit: number = 1) {
    if(this.watcherLimit < 1) {
      throw "watcherLimit must be interger greater then 1.";
    }
  }

  public static push(name: string) {
    if(!TaskSerial.queue.includes(name)) {
      TaskSerial.queue.push(name);
    }
  }

  async getOrder() {
    const orders = dg.overallOrder().map((x) => states.findByName(x)?.path);;
    return orders;
  }

  async runTask() {
    let pendingTasksNums = pendingTasks.remaining();

    if(pendingTasksNums > 0) {
      await this.execTask();
    } else {
      setTimeout(async () => {
        await this.runTask();
      }, 1000);
    }
  }

  async execTask() {
    const orders = await this.getOrder();
    const idx = orders.findIndex(x => x === undefined);

    if(idx >= 0) {
      return;
    } else {
      pendingTasks.useOrder(orders as string[]);
      const name = pendingTasks.next();

      if(name) {
        const state = states.findByName(name);

        if(state) {
          const resolvedDir = path.join(root, state.path);

          status.postMsg(`compiling ${name}`);
          const closable = await workspaceItemDoDev({ root: resolvedDir, buildService: bfswBuildService! });
          runningTasks.set(state.userConfig.name, closable);
          status.postMsg(`${name} compilation finished`);
        }
      }
    }

    await this.runTask();
  }

  async addRollupWatcher() {
    while(TaskSerial.queue.length > 0 && TaskSerial.activeWatcherNums < this.watcherLimit) {
      TaskSerial.activeWatcherNums++;
      this.execWatcher();
    }

    setTimeout(async () => {
      await this.addRollupWatcher();
    }, 1000);
  }

  execWatcher() {
    const name = TaskSerial.queue.shift()!;
    const closable = runningTasks.get(name);

    closable?.restart();
  }
}
