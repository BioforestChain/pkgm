import { sleep } from "@bfchain/util-extends-promise";
import { PromiseOut } from "@bfchain/util-extends-promise-out";
import chalk from "chalk";
import { renameSync, existsSync, rmSync } from "node:fs";
import { copyFile, rm } from "node:fs/promises";
import path from "node:path";
import { build as buildBfsp } from "vite";
import { $BfspUserConfig, parseExports, parseFormats } from "../src";
import { watchBfspProjectConfig, writeBfspProjectConfig } from "../src/bfspConfig";
import { $TsConfig, generateTsConfig, isTestFile } from "../src/configs/tsConfig";
import { generateViteConfig } from "../src/configs/viteConfig";
import { Debug } from "../src/logger";
import { multi, multiDevTui, multiTsc } from "../src/multi";
import { Closeable, fileIO, folderIO, SharedAsyncIterable, toPosixPath, walkFiles } from "../src/toolkit";
import { runTerser } from "./terser/runner";
import { writeJsonConfig } from "./util";
import { ViteConfigFactory } from "./vite/configFactory";
import { consts } from "../src/consts";
import { $PackageJson } from "../src/configs/packageJson";
import { tui } from "../src/tui";

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
  const viteLogger = multiDevTui.createViteLogger("info", {});
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
export const doBuild = async (options: {
  root?: string;
  streams: ReturnType<typeof watchBfspProjectConfig>;
  tscStream: SharedAsyncIterable<boolean>;
  depStream: SharedAsyncIterable<boolean>;
}) => {
  const log = Debug("bfsp:bin/build");

  const { root = process.cwd() } = options;

  log("root", root);

  /// 初始化写入配置
  const subStreams = options.streams;
  const { tscStream, depStream } = options;

  const tscLogger = multiDevTui.createTscLogger();
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
    const tsConfig1 = await generateTsConfig(root, userConfig1);

    log(`generate ViteConfig\n`);
    const viteConfig1 = await generateViteConfig(root, userConfig1, tsConfig1);

    const format = userConfigBuild.formats?.[0] ?? "esm";
    const c = ViteConfigFactory({
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
    {
      const repathTypePath = (typePath: string) => {
        const typesPathInfo = path.parse(typePath);
        return toPosixPath(path.join("source/isolated", path.join(typesPathInfo.dir, typesPathInfo.name + ".d.ts")));
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
    await multiTsc.buildStage2({
      tsConfigPath: path.resolve(path.join(cacheBuildOutDir, "tsconfig.json")),
    });

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

        const buildOutDirs = new Set<string>();
        let i = 0;
        for (const x of buildUserConfigs) {
          i++;

          log(`start build task: ${i}/${buildUserConfigs.length}\n`);
          log(`removing bundleOutRoot: ${CACHE_BUILD_OUT_ROOT}\n`);
          const userConfigBuild = x;

          const buildOutDir = path.resolve(BUILD_OUT_ROOT, userConfigBuild.name);
          const cacheBuildOutDir = path.resolve(CACHE_BUILD_OUT_ROOT, userConfigBuild.name);
          const singleReporter = (s: string) => {
            reporter(`${x.name} > ${s}`);
          };
          await buildSingle({
            userConfigBuild,
            thePackageJson,
            buildOutDir,
            cacheBuildOutDir,
            stateReporter: singleReporter,
          });
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
        tscLogger.write(chalk.red(e));
      }
    },
  };
};
