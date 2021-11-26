import { sleep } from "@bfchain/util-extends-promise";
import { PromiseOut } from "@bfchain/util-extends-promise-out";
import chalk from "chalk";
import { renameSync, existsSync } from "node:fs";
import { copyFile, rm } from "node:fs/promises";
import path from "node:path";
import { build as buildBfsp } from "vite";
import { parseExports, parseFormats } from "../src";
import { getBfspProjectConfig, watchBfspProjectConfig, writeBfspProjectConfig } from "../src/bfspConfig";
import { $TsConfig, generateTsConfig, isTestFile, TSC_OUT_ROOT } from "../src/configs/tsConfig";
import { generateViteConfig } from "../src/configs/viteConfig";
import { Debug } from "../src/logger";
import { multiDevTui } from "../src/multi";
import { Closeable, fileIO, folderIO, toPosixPath, walkFiles } from "../src/toolkit";
import { runTerser } from "./terser/runner";
import { runTsc, RunTscOption } from "./tsc/runner";
import { writeJsonConfig } from "./util";
import { ViteConfigFactory } from "./vite/configFactory";

const CACHE_BUILD_OUT_ROOT = `./.bfsp/build`;
const BUILD_OUT_ROOT = `./build`;

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
export const doBuild = async (options: { root?: string; profiles?: string[] }) => {
  const log = Debug("bfsp:bin/build");

  const { root = process.cwd() } = options;

  log("root", root);

  const config = await getBfspProjectConfig(root);
  existsSync(TSC_OUT_ROOT) && (await rm(TSC_OUT_ROOT, { recursive: true }));
  existsSync(BUILD_OUT_ROOT) && (await rm(BUILD_OUT_ROOT, { recursive: true }));

  /// 初始化写入配置
  const subConfigs = await writeBfspProjectConfig(config);

  /// 监听项目变动
  const subStreams = watchBfspProjectConfig(config!, subConfigs);
  const tscLogger = multiDevTui.createTscLogger();

  const abortable = Closeable<string, string>("bin:build", async (reasons) => {
    /**防抖，避免不必要的多次调用 */
    const closeSign = new PromiseOut<unknown>();
    (async () => {
      /// debounce
      await sleep(500);
      if (closeSign.is_finished) {
        log("skip vite build by debounce");
        return;
      }

      const userConfig = await subStreams.userConfigStream.getCurrent();

      log("running bfsp build!");

      const baseRunTscOpts = {
        onClear: () => tscLogger.clear(),
        onMessage: (s) => tscLogger.write(s),
      } as RunTscOption;

      // watch模式监听ts代码改动
      const tscWatcher = runTsc({
        ...baseRunTscOpts,
        tsconfigPath: path.join(root, "tsconfig.json"),
        onSuccess: async () => {
          try {
            /// tsc验证没问题，开始执行vite打包
            /// @todo 以下流程包裹成 closeable

            const buildUserConfigs = userConfig.userConfig.build
              ? userConfig.userConfig.build.map((build) => ({
                  ...userConfig.userConfig,
                  ...build,
                }))
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

            for (const [i, x] of buildUserConfigs.entries()) {
              log(`start build task: ${i + 1}/${buildUserConfigs.length}\n`);
              log(`removing bundleOutRoot: ${CACHE_BUILD_OUT_ROOT}\n`);
              existsSync(CACHE_BUILD_OUT_ROOT) && (await rm(CACHE_BUILD_OUT_ROOT, { recursive: true }));

              const userConfigBuild = Object.assign({}, userConfig.userConfig, x);
              const cacheBuildOutRoot = path.join(CACHE_BUILD_OUT_ROOT, userConfigBuild.name);

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
              c.build!.outDir = cacheBuildOutRoot;
              await taskViteBuild({ ...c, mode: "development" }); // vite 打包

              log(`prepare es2020 files for complie to es2019\n`);
              const renameFileMap = await taskRenameJsToTs(path.join(root, cacheBuildOutRoot)); // 改打包出来的文件后缀 js=>ts

              const packageJson = jsonClone({
                ...(await subStreams.packageJsonStream.getCurrent()),
                files: ["dist", "source"],
                scripts: undefined,
                devDependencies: undefined,
                ...userConfigBuild.packageJson,
              });
              /// 将package.json的types路径进行修改
              {
                const repathTypePath = (typePath: string) => {
                  const typesPathInfo = path.parse(typePath);
                  return toPosixPath(
                    path.join("source/isolated", path.join(typesPathInfo.dir, typesPathInfo.name + ".d.ts"))
                  );
                };
                for (const exportConfig of Object.values(packageJson.exports)) {
                  exportConfig.types = repathTypePath(exportConfig.types);
                }
                packageJson.types = repathTypePath(packageJson.types);
              }

              log(`complile to es2019\n`);
              // 在打包出来的目录生成tsconfig，主要是为了es2020->es2019
              const buildOutDir = path.resolve(BUILD_OUT_ROOT, packageJson.name);
              buildOutDirs.add(buildOutDir);

              /**dev默认输出的dist文件夹 */
              const distDir = path.join(buildOutDir, defaultOurDir);
              await taskWriteTsConfigStage2(cacheBuildOutRoot, distDir, tsConfig1, [...renameFileMap.values()]);

              // 打包目录执行tsc
              await runTsc({
                ...baseRunTscOpts,
                projectMode: true,
                onMessage: () => {}, /// 此时会有异常日志，直接忽略就行，因为是js文件
                tsconfigPath: path.resolve(path.join(cacheBuildOutRoot, "tsconfig.json")),
              });

              /// 写入package.json
              await writeJsonConfig(path.join(buildOutDir, "package.json"), packageJson);

              /// 执行代码压缩
              log(`minify ${chalk.cyan(userConfigBuild.name)}\n`);
              await runTerser({ sourceDir: distDir, logError: (s) => tscLogger.write(s) }); // 压缩
              tscLogger.write(`built ${chalk.cyan(userConfigBuild.name)} [${format}] at ${chalk.blue(buildOutDir)}\n`);

              /// 最后再将js文件的后缀换回去
              for (const [jsFilename, tsFilename] of renameFileMap) {
                renameSync(path.join(distDir, tsFilename.slice(0, -2) + "js"), path.join(distDir, jsFilename));
              }
              log("rename done\n");

              /// 修改样式
              tscLogger.updateLabel({ errorCount: 0 });
              tscLogger.stop();
            }

            /// 复制 .d.ts 文件到 source 文件夹中
            for (const buildOutDir of buildOutDirs) {
              const tscOutRoot = path.join(root, TSC_OUT_ROOT);
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

        watch: true,
      });

      closeSign.onSuccess((reason) => {
        log("close bfsp build, reason: ", reason);
        tscWatcher.stop();
      });
    })();

    return (reason: unknown) => {
      closeSign.resolve(reason);
    };
  });

  /// 开始监听并触发编译
  subStreams.userConfigStream.onNext(() => abortable.restart("userConfig changed"));
  subStreams.viteConfigStream.onNext(() => abortable.restart("viteConfig changed"));
  subStreams.tsConfigStream.onNext(() => abortable.restart("tsConfig changed"));
  if (subStreams.viteConfigStream.hasCurrent()) {
    abortable.start();
  }
};
