import { chalk } from "@bfchain/pkgm-base/lib/chalk";
import { getVite } from "@bfchain/pkgm-base/lib/vite";
import { existsSync } from "node:fs";
import { copyFile, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { $BfspUserConfig, $getBfspUserConfig, getBfspUserConfig } from "../src/configs/bfspUserConfig";
import { writeBfspProjectConfig } from "../src/bfspConfig";
import { $PackageJson, generatePackageJson } from "../src/configs/packageJson";
import { $TsConfig, generateTsConfig, writeTsConfig } from "../src/configs/tsConfig";
import { generateViteConfig } from "../src/configs/viteConfig";
import * as consts from "../src/consts";
import { createTscLogger, createViteLogger, DevLogger } from "../sdk/logger/logger";
import { fileIO, folderIO, walkFiles, writeJsonConfig } from "../sdk/toolkit/toolkit.fs";
import { toPosixPath } from "../sdk/toolkit/toolkit.path";
import { getTui, PanelStatus } from "../sdk/tui/index";
import { runTerser } from "./terser/runner";
import { runTsc } from "./tsc/runner";
import { ViteConfigFactory } from "./vite/configFactory";
import { runYarn } from "./yarn/runner";
import { jsonClone } from "../sdk/toolkit/toolkit.util";
import { TypingsGenerator } from "./typingsGenerator";
import os from "node:os";
const debug = DevLogger("bfsp:bin/build");

export const installBuildDeps = async (options: { root: string }) => {
  const { root } = options;
  const depsPanel = getTui().getPanel("Deps");
  depsPanel.updateStatus("loading");
  const isSuccess = await runYarn({
    root,
    logger: depsPanel.depsLogger,
  }).afterDone;
  depsPanel.updateStatus(isSuccess ? "success" : "error");
};

export const runBuildTsc = async (options: { root: string; tscLogger: ReturnType<typeof createTscLogger> }) => {
  const { root, tscLogger } = options;
  const tscCompilation = new Promise<boolean>((resolve) => {
    const tscStoppable = runTsc({
      watch: true,
      tsconfigPath: path.join(root, "tsconfig.json"),
      onMessage: (s) => tscLogger.write(s),
      onClear: () => tscLogger.clear(),
      onSuccess: () => {
        tscStoppable.stop();
        resolve(true);
      },
    });
  });
  return await tscCompilation;
};

/**
 * 修复profile类型路径
 * ```ts
 * import xxx from "#abc"
 * // 修改为
 * import xxx from "./abc#<profile>"
 * ```
 * @param tsConfigPaths tsconfig.compilerOptions.paths
 * @param baseDir typings根路径
 * @param file 需要修改路径的文件
 */
const rePathProfileImports = async (tsConfigPaths: { [path: string]: string[] }, baseDir: string, file: string) => {
  const getRealPath = (key: string) => {
    const path1 = path.relative(baseDir, file);
    /**
     * @TODO 这里的import要根据实际的profile来resolve
     */
    const path2 = tsConfigPaths[`#${key}`][0]; // 实际指向的路径
    return toPosixPath(path.relative(path.dirname(path1), path2)).replace(/\.ts$/, ""); // trim ending .ts;
  };

  const contents = (await readFile(file)).toString();

  await writeFile(
    file,
    contents
      // import xxx from "#xxx"
      .replace(/(im|ex)port (.*) from "#(.*)"/g, (_, p1, p2, p3) => {
        const p = getRealPath(p3);
        return `${p1}port ${p2} from "${p}"`;
      })
      // import "#xxx"
      .replace(/(im|ex)port "#(.*)"/g, (_, p1, p2) => {
        const p = getRealPath(p2);
        return `${p1}port "${p}"`;
      })
  );
};

/**
 * 执行编译
 * 流程如下：
 *
 * 1. 生成新的 package.json ，并安装依赖
 * 1. 执行 typescript 编译
 */
const buildSingle = async (options: {
  root: string;
  buildOutDir: string;

  thePackageJson: $PackageJson;
  bfspUserConfig: $BfspUserConfig;

  buildLogger: BuildLogger;
}) => {
  const tscLogger = createTscLogger();
  const { viteLoggerKit } = getTui().getPanel("Build");
  const viteLogger = createViteLogger(viteLoggerKit);
  const {
    //
    root,
    thePackageJson,
    buildOutDir,
    bfspUserConfig,
  } = options;
  const buildConfig = bfspUserConfig.userConfig;
  const { debug, flag, success, info, warn, error, logger } = options.buildLogger;

  const userConfig1 = $getBfspUserConfig(buildConfig);

  const TYPINGS_DIR = "typings"; // #40，tsc只是用来生成类型

  flag(`generating tsconfig.json`);
  const tsConfig1 = await generateTsConfig(root, userConfig1, {
    outDirRoot: path.relative(root, buildOutDir),
    outDirName: TYPINGS_DIR,
    logger,
  });

  flag(`setting tsconfig.json`);
  await writeTsConfig(root, userConfig1, tsConfig1);
  success(`set tsconfig.json`);

  //#region 生成 package.json
  flag(`generating package.json`);
  /// 将 package.json 的 types 路径进行修改
  const packageJson = await generatePackageJson(root, bfspUserConfig, tsConfig1, {
    packageTemplateJson: thePackageJson,
    customTypesRoot: "./typings",
  });

  await writeJsonConfig(path.resolve(root, "package.json"), packageJson);
  //#region 安装依赖
  flag(`installing dependencies`);
  await installBuildDeps({ root });
  success(`installed dependencies`);
  //#endregion

  /// 写入package.json
  flag(`writing package.json`);
  Reflect.deleteProperty(packageJson, "scripts");
  Reflect.deleteProperty(packageJson, "private");
  await writeJsonConfig(path.resolve(buildOutDir, "package.json"), packageJson);
  success(`wrote package.json`);
  //#endregion

  //#region 编译typescript，生成 typings
  {
    flag(`generate typings`);
    await new TypingsGenerator({ root, logger: tscLogger, tsConfig: tsConfig1 }).generate();
    success(`generated typings`);

    /// 修复 typings 文件的导入
    const tscSafeRoot = path.resolve(buildOutDir, TYPINGS_DIR);

    flag("fix imports");
    for await (const filepath of walkFiles(tscSafeRoot, { refreshCache: true })) {
      if (filepath.endsWith(".d.ts") && filepath.endsWith(".test.d.ts") === false) {
        await rePathProfileImports(tsConfig1.json.compilerOptions.paths, tscSafeRoot, filepath);
      }
    }
    success("fixed imports");
  }
  //#endregion

  {
    flag("add type references");
    const exp = packageJson.exports as any;
    for (const x of Object.keys(exp)) {
      const p = path.resolve(buildOutDir, exp[x].types);
      let contents;
      try {
        contents = await readFile(p);
      } catch (e) {
        continue;
      }
      const rp = path.relative(p, path.resolve(buildOutDir, TYPINGS_DIR, "refs.d.ts"));
      const refSnippet = `///<reference path="${toPosixPath(rp)}" />${os.EOL}`;
      const buf = Buffer.alloc(contents.length + refSnippet.length);
      buf.write(refSnippet);
      if (contents.length > buf.length && contents.compare(buf, 0, buf.length, 0, buf.length) !== 0) {
        contents.copy(buf, refSnippet.length);
        await writeFile(p, buf);
      }
    }
    success("added type references");
  }

  //#region 使用 vite(rollup+typescript+esbuild) 编译打包代码
  flag(`generating bundle config`);
  const viteConfig1 = await generateViteConfig(root, userConfig1, tsConfig1);
  const jsBundleConfig = ViteConfigFactory({
    userConfig: buildConfig,
    projectDirpath: root,
    viteConfig: viteConfig1,
    tsConfig: tsConfig1,
    outRoot: buildOutDir,
    logger: viteLoggerKit.logger,
    format: userConfig1.formatExts[0].format ?? "esm",
  });
  const distDir = jsBundleConfig.build!.outDir!;

  /// vite 打包
  flag(`bundling javascript codes`);
  await getVite().build({
    ...jsBundleConfig,
    build: {
      ...jsBundleConfig.build,
      minify: false,
      watch: null,
      rollupOptions: {
        ...jsBundleConfig.build?.rollupOptions,
        onwarn: (err) => warn(err),
      },
    },
    mode: "production",
    customLogger: viteLogger,
  });
  success(viteLoggerKit.content.all.trim());
  viteLoggerKit.clearScreen();

  success(`bundled javascript codes`);

  //#endregion

  /// 执行代码压缩
  flag(`minifying javascript codes`);
  await runTerser({ sourceDir: distDir, logError: error }); // 压缩
  success(`minified javascript codes`);

  return tsConfig1;
};

/**
 * 整理出要执行 build 的配置
 * 这是一个递归的过程
 */
const collectBuildConfigs = (rootConfig: Bfsp.UserConfig, configList: Omit<Bfsp.UserConfig, "build">[] = []) => {
  if (rootConfig.build?.length) {
    for (const buildPartial of rootConfig.build) {
      let buildConfig = {
        ...rootConfig,
      };
      delete buildConfig.build;
      buildConfig = {
        ...buildConfig,
        ...buildPartial,
      };
      collectBuildConfigs(buildConfig, configList);
    }
  } else if (rootConfig.formats !== undefined && rootConfig.formats.length > 1) {
    for (const format of rootConfig.formats) {
      const buildConfig = {
        ...rootConfig,
        formats: [format],
      };
      collectBuildConfigs(buildConfig, configList);
    }
  } else {
    configList.push(rootConfig);
  }
  return configList;
};

class BuildLogger {
  constructor(
    public prompts: string[] = [],
    private readonly bundlePanel = getTui().getPanel("Build"),
    private readonly statusBar = getTui().status
  ) {}

  private get _prompt() {
    return this.prompts[this.prompts.length - 1] || "";
  }
  readonly logger = this.bundlePanel.logger;
  log = this.logger.log;
  info = this.logger.info;
  success = this.logger.success;
  warn = this.logger.warn;
  error = this.logger.error;
  clearScreen = this.logger.clear;
  flag = (msg: string, loading = true) => {
    this.statusBar.setMsg(`${this._prompt} ${msg}`, loading);
  };
  debug = (msg: string) => {
    debug(`${this._prompt} ${msg}`);
  };
  updateStatus = (status: PanelStatus) => {
    this.bundlePanel.updateStatus(status);
  };
}

export const doBuild = async (args: {
  root?: string;
  subConfigs: Awaited<ReturnType<typeof writeBfspProjectConfig>>;
  bfspUserConfig: $BfspUserConfig;
}) => {
  const { root = process.cwd(), subConfigs, bfspUserConfig } = args; //fs.existsSync(maybeRoot) && fs.statSync(maybeRoot).isDirectory() ? maybeRoot : cwd;
  const buildLogger = new BuildLogger([bfspUserConfig.userConfig.name]);

  buildLogger.debug(`root: ${root}`);

  /**统一的 build 文件夹 */
  const BUILD_OUT_ROOT = path.resolve(path.join(root, consts.BuildOutRootPath));

  /**基本的 package.json */
  const thePackageJson = subConfigs.packageJson;

  buildLogger.debug("running bfsp build!");
  try {
    /**拆分出一个个独立的 build 作业 */
    const buildUserConfigList = collectBuildConfigs(bfspUserConfig.userConfig);

    buildLogger.updateStatus("loading");

    /**已经清理过的文件夹目录，避免重复清理 */
    const rmDirs = new Set<string>();
    for (const [index, userConfig] of buildUserConfigList.entries()) {
      const buildTitle = chalk.gray(`${userConfig.name}::${userConfig.formats?.[0] ?? "esm"}`);
      buildLogger.prompts.push(buildTitle);
      const startTime = Date.now();
      const taskTitle = `build task: (${index + 1}/${buildUserConfigList.length})`;
      buildLogger.info(`${chalk.blue(">>>")} start ${taskTitle}`);

      {
        /**要输出的文件夹根路径 */
        const buildOutDir = path.resolve(BUILD_OUT_ROOT, userConfig.name);

        /// 按需移除 build 文件夹
        if (rmDirs.has(buildOutDir) === false) {
          rmDirs.add(buildOutDir);
          existsSync(buildOutDir) && (await rm(buildOutDir, { recursive: true, force: true }));
        }
        /// 开始执行编译
        await buildSingle({
          /// 路径
          root,
          buildOutDir,

          /// 配置
          thePackageJson,
          bfspUserConfig: { ...bfspUserConfig, userConfig },

          /// 服务
          buildLogger,
        });

        // await buildService.afterSingleBuild({ buildOutDir, config: userConfig });
      }

      const buildTimeSpan = chalk.cyan("+" + (Date.now() - startTime) + "ms");
      buildLogger.info(`${chalk.green(">>>")} finished ${taskTitle} ${buildTimeSpan}`);
      buildLogger.prompts.pop();
    }
    buildLogger.flag(chalk.magenta("🎉 build finished 🎊"), false);
    buildLogger.updateStatus("success");
  } catch (e) {
    buildLogger.flag(chalk.red("build failed"), false);
    buildLogger.error(e);
  }
};
