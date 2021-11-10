import { sleep } from "@bfchain/util-extends-promise";
import { PromiseOut } from "@bfchain/util-extends-promise-out";
import chalk from "chalk";
import { renameSync, existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { build as buildBfsp } from "vite";
import { parseExports, parseFormats } from "../src";
import { getBfspProjectConfig, watchBfspProjectConfig, writeBfspProjectConfig } from "../src/bfspConfig";
import { $TsConfig, generateTsConfig, isTestFile } from "../src/configs/tsConfig";
import { generateViteConfig } from "../src/configs/viteConfig";
import { createDevTui, Debug } from "../src/logger";
import { Closeable, fileIO, walkFiles } from "../src/toolkit";
import { runTerser } from "./terser/runner";
import { runTsc, RunTscOption } from "./tsc/runner";
import { ViteConfigFactory } from "./vite/configFactory";

let devTui: ReturnType<typeof createDevTui> | undefined;
const getDevTui = () => {
  if (devTui === undefined) {
    devTui = createDevTui();
  }
  return devTui;
};

const tscOutRoot = `./node_modules/.bfsp/tsc`;
const bundleOutRoot = `./node_modules/.bfsp/build`;
const finalOutRoot = `./build`;

// 任务：生成阶段2的tsconfig
const taskWriteTsConfigStage2 = async (bundlePath: string, outDir: string, tsConfig: $TsConfig, files: string[]) => {
  const tscOutStage2TypingsRoot = path.resolve(outDir, "typings");
  const c = JSON.parse(JSON.stringify(tsConfig)) as typeof tsConfig;
  c.json.compilerOptions.noEmit = false; // true无法生成js文件
  c.json.compilerOptions.target = "es2019";
  c.json.compilerOptions.outDir = outDir;
  c.isolatedJson.compilerOptions.outDir = outDir;
  c.typingsJson.compilerOptions.outDir = tscOutStage2TypingsRoot;
  delete (c.json as any).references;

  c.json.files = files; //Object.keys(userConfig.exportsDetail.formatedExports).map((x) => `${x}.ts`);

  await fileIO.setVal(
    path.resolve(path.join(bundlePath, "tsconfig.json")),
    Buffer.from(JSON.stringify(c.json, null, 2))
  );
  return c;
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
  const viteLogger = getDevTui().createViteLogger("info", {});
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

  /// 初始化写入配置
  const subConfigs = await writeBfspProjectConfig(config);
  existsSync(tscOutRoot) && (await rm(tscOutRoot, { recursive: true }));
  existsSync(finalOutRoot) && (await rm(finalOutRoot, { recursive: true }));

  /// 监听项目变动
  const subStreams = watchBfspProjectConfig(config!, subConfigs);
  const tscLogger = getDevTui().createTscLogger();

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

            for (const [i, x] of buildUserConfigs.entries()) {
              tscLogger.write(`start build task: ${i + 1}/${buildUserConfigs.length}\n`);
              tscLogger.write(`removing bundleOutRoot: ${bundleOutRoot}\n`);
              existsSync(bundleOutRoot) && (await rm(bundleOutRoot, { recursive: true }));

              const userConfigBuild = Object.assign({}, userConfig.userConfig, x);
              const bundlePath = path.join(bundleOutRoot, userConfigBuild.name);

              const userConfig1 = {
                userConfig: userConfigBuild,
                exportsDetail: parseExports(userConfigBuild.exports),
                formats: parseFormats(userConfigBuild.formats),
              };
              tscLogger.write(`generate TsConfig\n`);
              const tsConfig1 = await generateTsConfig(root, userConfig1);

              tscLogger.write(`generate ViteConfig\n`);
              const viteConfig1 = await generateViteConfig(root, userConfig1, tsConfig1);

              const format = userConfigBuild.formats?.[0] ?? "esm";
              const c = ViteConfigFactory({
                projectDirpath: root,
                viteConfig: viteConfig1,
                tsConfig: tsConfig1,
                format,
                // outDir: bundlePath,
              });
              const defaultOurDir = c.build!.outDir!;
              c.build!.outDir = bundlePath;
              await taskViteBuild({ ...c, mode: "development" }); // vite 打包

              tscLogger.write(`prepare es2020 files for complie to es2019\n`);
              const renameFileMap = await taskRenameJsToTs(path.join(root, bundlePath)); // 改打包出来的文件后缀 js=>ts

              const packageJson = {
                ...(await subStreams.packageJsonStream.getCurrent()),
                files: ["dist"],
                scripts: undefined,
                devDependencies: undefined,
                ...userConfigBuild.packageJson,
              };

              tscLogger.write(`complile to es2019\n`);
              // 在打包出来的目录生成tsconfig，主要是为了es2020->es2019
              const outDir = path.resolve(finalOutRoot, packageJson.name);
              const distDir = path.join(outDir, defaultOurDir);
              await taskWriteTsConfigStage2(bundlePath, distDir, tsConfig1, [...renameFileMap.values()]);

              // 打包目录执行tsc
              await runTsc({
                ...baseRunTscOpts,
                projectMode: true,
                onMessage: () => {}, /// 此时会有异常日志，直接忽略就行，因为是js文件
                tsconfigPath: path.resolve(path.join(bundlePath, "tsconfig.json")),
              });

              /// 写入package.json
              fileIO.setVal(path.join(outDir, "package.json"), Buffer.from(JSON.stringify(packageJson, null, 2)));

              /// 执行代码压缩
              tscLogger.write(`minify ${chalk.cyan(userConfigBuild.name)}\n`);
              await runTerser({ sourceDir: distDir, logError: (s) => tscLogger.write(s) }); // 压缩
              tscLogger.write(`built ${chalk.cyan(userConfigBuild.name)} [${format}] at ${chalk.blue(outDir)}\n`);

              /// 最后再将js文件的后缀换回去
              for (const [jsFilename, tsFilename] of renameFileMap) {
                renameSync(path.join(distDir, tsFilename.slice(0, -2) + "js"), path.join(distDir, jsFilename));
              }
              tscLogger.write("rename done\n");

              /// 修改样式
              tscLogger.updateLabel({ errorCount: 0 });
              tscLogger.stop();
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
