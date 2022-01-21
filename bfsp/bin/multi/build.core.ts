import chalk from "chalk";
import fs, { existsSync, renameSync, rmSync } from "node:fs";
import { copyFile, rm, stat, symlink, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { build as buildBfsp } from "vite";
import { parseExports, parseFormats, readWorkspaceConfig } from "../../src";
import { watchBfspProjectConfig, writeBfspProjectConfig } from "../../src/bfspConfig";
import { $PackageJson } from "../../src/configs/packageJson";
import { $TsConfig, generateTsConfig, isTestFile } from "../../src/configs/tsConfig";
import { generateViteConfig } from "../../src/configs/viteConfig";
import { consts } from "../../src/consts";
import { BuildService } from "../../src/core";
import { watchDeps } from "../../src/deps";
import { createTscLogger, createViteLogger, Debug } from "../../src/logger";
import { folderIO, Loopable, SharedAsyncIterable, toPosixPath, walkFiles } from "../../src/toolkit";
import { getTui } from "../../src/tui/index";
import { runTerser } from "../terser/runner";
import { runTsc } from "../tsc/runner";
import { Tasks, writeJsonConfig } from "../util";
import { ViteConfigFactory } from "../vite/configFactory";
import { runYarn } from "../yarn/runner";
const jsonClone = <T>(obj: T) => JSON.parse(JSON.stringify(obj)) as T;
// 任务：生成阶段2的tsconfig，用于es2020到es2019
const taskWriteTsConfigStage2 = async (bundlePath: string, outDir: string, tsConfig: $TsConfig, files: string[]) => {
  const tsconfigJson = jsonClone(tsConfig.json) as typeof tsConfig["json"];

  tsconfigJson.compilerOptions = {
    ...tsconfigJson.compilerOptions,
    composite: false,
    noEmit: false,
    target: "es2019",
    outDir: outDir,
    declaration: false,
  };

  Reflect.deleteProperty(tsconfigJson, "references");

  tsconfigJson.files = files;
  await writeJsonConfig(path.resolve(path.join(bundlePath, "tsconfig.json")), tsconfigJson);

  return tsconfigJson;
};

const taskRenameJsToTs = async (root: string) => {
  const renameFileMap = new Map<string, string>();
  for await (const filepath of walkFiles(root, { refreshCache: true })) {
    if (/\.[mc]?js[x]?$/.test(filepath)) {
      const newFilepath = filepath.replace(/(.*)\.[mc]?js[x]?$/, "$1.ts");
      if (isTestFile("", newFilepath)) {
        continue;
      }
      renameSync(filepath, newFilepath);
      renameFileMap.set(path.relative(root, filepath), path.relative(root, newFilepath));
    }
  }
  return renameFileMap;
};
const taskViteBuild = async (viteBuildConfig: ReturnType<typeof ViteConfigFactory>) => {
  const viteLogger = createViteLogger("info", {});
  await buildBfsp({
    ...viteBuildConfig,
    build: {
      ...viteBuildConfig.build,
      minify: false,
      watch: null,
      rollupOptions: {
        ...viteBuildConfig.build?.rollupOptions,
        onwarn: (err) => viteLogger.warn(chalk.yellow(String(err))),
      },
    },
    mode: "production",
    customLogger: viteLogger,
  });
};
const doBuild = (options: {
  root?: string;
  workspaceRoot: string;
  streams: ReturnType<typeof watchBfspProjectConfig>;
  tscStream: SharedAsyncIterable<boolean>;
  depStream: SharedAsyncIterable<boolean>;
  buildService: BuildService;
  mode: "dev" | "build";
}) => {
  const log = Debug("bfsp:bin/build");

  const { root = process.cwd(), workspaceRoot, mode, buildService } = options;

  log("root", root);

  /// 初始化写入配置
  const subStreams = options.streams;
  const { tscStream, depStream } = options;

  const tscLogger = createTscLogger();
  const viteLogger = createViteLogger();
  const CACHE_BUILD_OUT_ROOT = path.resolve(path.join(root, consts.CacheBuildOutRootPath));
  const BUILD_OUT_ROOT = path.resolve(path.join(root, consts.BuildOutRootPath));
  const TSC_OUT_ROOT = path.resolve(path.join(root, consts.TscOutRootPath));

  const buildSingle = async (options: {
    userConfigBuild: Omit<Bfsp.UserConfig, "build">;
    thePackageJson: $PackageJson;
    buildOutDir: string;
    cacheBuildOutDir: string;
    stateReporter: (s: string) => void;
  }) => {
    const report = options.stateReporter;
    const { userConfigBuild, thePackageJson, buildOutDir, cacheBuildOutDir } = options;
    existsSync(buildOutDir) && (await rm(buildOutDir, { recursive: true, force: true }));

    const userConfig1 = {
      userConfig: userConfigBuild,
      exportsDetail: parseExports(userConfigBuild.exports),
      formatExts: parseFormats(userConfigBuild.formats),
    };
    log(`generate TsConfig\n`);
    const tsConfig1 = await generateTsConfig(root, userConfig1, buildService);

    log(`generate ViteConfig\n`);
    const viteConfig1 = await generateViteConfig(root, userConfig1, tsConfig1);

    const format = userConfigBuild.formats?.[0] ?? "esm";
    const c = ViteConfigFactory({
      buildService,
      userConfig: userConfigBuild,
      projectDirpath: root,
      viteConfig: viteConfig1,
      tsConfig: tsConfig1,
      format,
      // outDir: bundlePath,
    });
    const defaultOurDir = c.build!.outDir!;
    c.build!.outDir = cacheBuildOutDir;
    report("vite build");
    await taskViteBuild({ ...c, mode: "development" }); // vite 打包

    log(`prepare es2020 files for complie to es2019\n`);
    report("prepare es2019");
    const renameFileMap = await taskRenameJsToTs(cacheBuildOutDir); // 改打包出来的文件后缀 js=>ts

    /// 将package.json的types路径进行修改
    const packageJson = jsonClone({
      ...thePackageJson,
      files: ["dist", "source"],
      scripts: undefined,
      devDependencies: undefined,
      ...userConfigBuild.packageJson,
      name: userConfigBuild.name,
    });
    delete packageJson.deps;
    {
      const repathTypePath = (typePath: string) => {
        // const typesPathInfo = path.parse(typePath);
        return toPosixPath(path.join("source/isolated", typePath));
      };
      for (const exportConfig of Object.values(packageJson.exports)) {
        exportConfig.types = repathTypePath(exportConfig.types);
      }
      packageJson.types = repathTypePath(packageJson.types);
    }

    report("compile to es2019");
    log(`complile to es2019\n`);
    // 在打包出来的目录生成tsconfig，主要是为了es2020->es2019

    /**dev默认输出的dist文件夹 */
    const distDir = path.join(buildOutDir, defaultOurDir);
    const files = [...renameFileMap.values()];
    if (files.length === 0) {
      // no files for compilation
      log(`[${userConfigBuild.name}] no files for tsc compilation`);
      return;
    }
    await taskWriteTsConfigStage2(cacheBuildOutDir, distDir, tsConfig1, files);

    // 打包目录执行tsc

    report("tsc compile");

    const buildStage2 = new Promise((resolve) => {
      runTsc({
        tsconfigPath: path.resolve(path.join(cacheBuildOutDir, "tsconfig.json")),
        projectMode: true,
        onMessage: (x) => {},
        onClear: () => tscLogger.clear(),
        onExit: () => resolve(null),
      });
    });
    await buildStage2;

    log(`writing package.json\n`);

    /// 写入package.json
    await writeJsonConfig(path.join(buildOutDir, "package.json"), packageJson);

    /// 执行代码压缩
    report("minify");
    log(`minify ${chalk.cyan(userConfigBuild.name)}\n`);
    await runTerser({ sourceDir: distDir, logError: (s) => tscLogger.write(s) }); // 压缩
    // tscLogger.write(`built ${chalk.cyan(userConfigBuild.name)} [${format}] at ${chalk.blue(buildOutDir)}\n`);

    report("rename");
    /// 最后再将js文件的后缀换回去
    for (const [jsFilename, tsFilename] of renameFileMap) {
      renameSync(path.join(distDir, tsFilename.slice(0, -2) + "js"), path.join(distDir, jsFilename));
    }
    log("rename done\n");

    report("done");
    /// 修改样式
    tscLogger.updateStatus("success");
  };

  const devSingle = async (options: {
    userConfigBuild: Omit<Bfsp.UserConfig, "build">;
    thePackageJson: $PackageJson;
    buildOutDir: string;
    cacheBuildOutDir: string;
    stateReporter: (s: string) => void;
  }) => {
    const report = options.stateReporter;
    const { userConfigBuild, thePackageJson, buildOutDir, cacheBuildOutDir } = options;
    existsSync(buildOutDir) && (await rm(buildOutDir, { recursive: true, force: true }));

    const userConfig1 = {
      userConfig: userConfigBuild,
      exportsDetail: parseExports(userConfigBuild.exports),
      formatExts: parseFormats(userConfigBuild.formats),
    };
    log(`generate TsConfig\n`);
    const tsConfig1 = await generateTsConfig(root, userConfig1, buildService);

    log(`generate ViteConfig\n`);
    const viteConfig1 = await generateViteConfig(root, userConfig1, tsConfig1);

    const format = userConfigBuild.formats?.[0] ?? "esm";
    const c = ViteConfigFactory({
      buildService,
      userConfig: userConfigBuild,
      projectDirpath: root,
      viteConfig: viteConfig1,
      tsConfig: tsConfig1,
      format,
      outDir: buildOutDir,
    });

    report("vite build");
    await taskViteBuild({ ...c, mode: "development" }); // vite 打包

    /// 将package.json的types路径进行修改
    const packageJson = jsonClone({
      ...thePackageJson,
      files: ["dist", "source"],
      scripts: undefined,
      devDependencies: undefined,
      ...userConfigBuild.packageJson,
      name: userConfigBuild.name,
    });
    delete packageJson.deps;
    {
      const repathTypePath = (typePath: string) => {
        // const typesPathInfo = path.parse(typePath);
        return toPosixPath(path.join("source/isolated", typePath));
      };
      for (const exportConfig of Object.values(packageJson.exports)) {
        exportConfig.types = repathTypePath(exportConfig.types);
      }
      packageJson.types = repathTypePath(packageJson.types);
    }

    log(`writing package.json\n`);

    /// 写入package.json
    await writeJsonConfig(path.join(buildOutDir, "package.json"), packageJson);

    report("done");
    /// 修改样式
    tscLogger.updateStatus("success");
  };

  return {
    async start(options: { stateReporter: (s: string) => void }) {
      const reporter = options.stateReporter;
      const userConfig = await subStreams.userConfigStream.getCurrent();
      const thePackageJson = await subStreams.packageJsonStream.getCurrent();
      log("running bfsp build!");

      try {
        /// tsc验证没问题，开始执行vite打包
        /// @todo 以下流程包裹成 closeable

        const buildUserConfigs = userConfig.userConfig.build
          ? userConfig.userConfig.build.map((build) => {
              const ret = {
                ...userConfig.userConfig,
                ...build,
              };
              Reflect.deleteProperty(ret, "build");
              return ret;
            })
          : [userConfig.userConfig];
        for (const buildConfig of buildUserConfigs.slice()) {
          if (buildConfig.formats !== undefined && buildConfig.formats.length > 1) {
            const singleFormatConfigs = buildConfig.formats.map((format) => ({
              ...buildConfig,
              formats: [format],
            }));
            buildUserConfigs.splice(buildUserConfigs.indexOf(buildConfig), 1, ...singleFormatConfigs);
          }
        }

        const buildFn = mode === "build" ? buildSingle : devSingle;
        const buildOutDirs = new Set<string>();
        let i = 0;
        for (const x of buildUserConfigs) {
          i++;

          log(`start build task: ${i}/${buildUserConfigs.length}\n`);
          log(`removing bundleOutRoot: ${CACHE_BUILD_OUT_ROOT}\n`);
          const userConfigBuild = x;

          const buildOutDir = path.resolve(BUILD_OUT_ROOT, userConfigBuild.name);
          const cacheBuildOutDir = path.resolve(CACHE_BUILD_OUT_ROOT, userConfigBuild.name);
          // 状态报告给外层，由外层组装后写入状态栏
          const singleReporter = (s: string) => {
            reporter(`${x.name} > ${s}`);
          };
          await buildFn({
            userConfigBuild,
            thePackageJson,
            buildOutDir,
            cacheBuildOutDir,
            stateReporter: singleReporter,
          });
          const symlinkType = os.platform() === "win32" ? "junction" : "dir";
          const symlinkTarget = path.join(workspaceRoot, "node_modules", x.name);
          if (fs.existsSync(symlinkTarget)) {
            const s = await stat(symlinkTarget);
            // log(`${symlinkTarget}: ${s.isSymbolicLink()}`);
            // if (s.isSymbolicLink()) {
            await unlink(symlinkTarget);
            // }
          }
          await symlink(buildOutDir, symlinkTarget, symlinkType);
          buildOutDirs.add(buildOutDir);
        }

        /// 复制 .d.ts 文件到 source 文件夹中
        for (const buildOutDir of buildOutDirs) {
          const tscOutRoot = TSC_OUT_ROOT;
          for await (const filepath of walkFiles(tscOutRoot, { refreshCache: true })) {
            if (filepath.endsWith(".d.ts") && filepath.endsWith(".test.d.ts") === false) {
              const destFilepath = path.join(buildOutDir, "source", path.relative(tscOutRoot, filepath));
              await folderIO.tryInit(path.dirname(destFilepath));
              await copyFile(filepath, destFilepath);
            }
          }
        }
      } catch (e) {
        viteLogger.error(e as any);
      }
    },
  };
};

export function runBuild(opts: { root: string; mode: "build" | "dev"; buildService: BuildService }) {
  const { root, mode, buildService } = opts;
  const log = Debug("bfsp:bin/boot");
  const tui = getTui();
  const depsLogger = tui.getPanel("Deps");

  const map = new Map<
    string,
    {
      closable: { start(opts: { stateReporter: (s: string) => void }): Promise<void> };
      streams: ReturnType<typeof watchBfspProjectConfig>;
    }
  >();

  let tasksRunning = false;
  let depsBuildReady = false; // 需要编译的依赖是否都已就绪
  let installingDep = false;
  let pendingDepInstallation = false;
  let depInited = false;
  const depLoopable = Loopable("install dep", () => {
    if (installingDep) {
      return;
    }
    installingDep = true;
    pendingDepInstallation = false;
    log("installing dep");
    depsLogger.updateStatus("loading");
    runYarn({
      root,
      onExit: () => {
        installingDep = false;
        if (pendingDepInstallation) {
          depLoopable.loop();
        } else {
          if (!depInited) {
            tui.status.postMsg("dep installation finished");
            depInited = true;
            queueTask();
          }
        }
      },
      onMessage: (s) => {
        depsLogger.write(s);
      },
    });
  });

  const pendingTasks = new Tasks<string>();

  const reporter = (s: string) => {
    tui.status.postMsg(`[ tasks remaining ... ${pendingTasks.remaining()} ] ${s}`);
  };
  const queueTask = async () => {
    if (tasksRunning) {
      return;
    }
    if (!depsBuildReady || !depInited) {
      return;
    }
    tasksRunning = true;
    const name = pendingTasks.next();
    if (name) {
      const s = map.get(name);
      if (s) {
        await s.closable.start({ stateReporter: reporter });
        if (pendingTasks.remaining() === 0) {
          tui.status.postMsg("all build tasks completed");
        }
        tasksRunning = false;

        await queueTask();
      }
    } else {
      tasksRunning = false;
      tui.status.postMsg("Waiting for tasks...");
      // 这里不用setInterval而采用链式setTimeout的原因是任务时间是不确定的
      setTimeout(async () => {
        await queueTask();
      }, 1000);
    }
  };

  multi.registerAllUserConfigEvent(async (e) => {
    const resolvedDir = path.resolve(e.path);

    // 状态维护
    if (e.type === "unlink") {
      const s = map.get(e.path)?.streams;
      if (s) {
        s.stopAll();
        map.delete(e.path);
      }
      return;
    }

    if (map.has(e.path)) {
      return;
    }

    const BUILD_OUT_ROOT = path.resolve(path.join(resolvedDir, consts.BuildOutRootPath));
    const TSC_OUT_ROOT = path.resolve(path.join(resolvedDir, consts.TscOutRootPath));
    existsSync(TSC_OUT_ROOT) && rmSync(TSC_OUT_ROOT, { recursive: true, force: true });
    existsSync(BUILD_OUT_ROOT) && rmSync(BUILD_OUT_ROOT, { recursive: true, force: true });

    const projectConfig = { projectDirpath: resolvedDir, bfspUserConfig: e.cfg };
    const subConfigs = await writeBfspProjectConfig(projectConfig, buildService);
    const subStreams = watchBfspProjectConfig(projectConfig, buildService, subConfigs);
    const tscStream = watchTsc(e.path);
    const depStream = watchDeps(resolvedDir, subStreams.packageJsonStream);
    depStream.onNext(() => depLoopable.loop());
    const closable = doBuild({
      root: resolvedDir,
      workspaceRoot: root,
      streams: subStreams,
      depStream,
      tscStream,
      buildService,
      mode,
    });
    map.set(e.path, { closable, streams: subStreams });
    subStreams.userConfigStream.onNext((x) => pendingTasks.add(e.path));
    subStreams.viteConfigStream.onNext((x) => pendingTasks.add(e.path));
    tscStream.onNext((x) => pendingTasks.add(e.path));
    depStream.onNext((x) => pendingTasks.add(e.path));

    const order = multi.getOrder();
    const idx = order.findIndex((x) => x === undefined);
    if (idx >= 0) {
      return;
    } else {
      pendingTasks.useOrder(order as string[]);
      depsBuildReady = true;
      await queueTask();
    }
  });

  initMultiRoot(root);
  initWorkspace();
  depLoopable.loop();
  initTsconfig();
  initTsc();
}
