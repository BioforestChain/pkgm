import { chalk } from "@bfchain/pkgm-base/lib/chalk";
import { getVite } from "@bfchain/pkgm-base/lib/vite";
import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createTscLogger, createViteLogger, DevLogger } from "../sdk/logger/logger";
import { walkFiles, writeJsonConfig } from "../sdk/toolkit/toolkit.fs";
import { toPosixPath } from "../sdk/toolkit/toolkit.path";
import { getTui, PanelStatus } from "../sdk/tui/index";
import { writeBfspProjectConfig } from "../src/bfspConfig";
import { $BfspUserConfig, $getBfspUserConfig } from "../src/configs/bfspUserConfig";
import { $PackageJson, generatePackageJson } from "../src/configs/packageJson";
import { generateTsConfig, writeTsConfig } from "../src/configs/tsConfig";
import { generateViteConfig } from "../src/configs/viteConfig";
import * as consts from "../src/consts";
import { runTerser } from "./terser/runner";
import { runTsc } from "./tsc/runner";
import { TypingsGenerator } from "./typingsGenerator";
import { ViteConfigFactory } from "./vite/configFactory";
import { runYarn } from "./yarn/runner";
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
  aggregatedPackageJson: $PackageJson;
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

  const { debug, flag, success, info, warn, error, logger } = options.buildLogger;

  const userConfig1 = $getBfspUserConfig(bfspUserConfig.userConfig);

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

  const buildConfig = userConfig1.userConfig as Bfsp.BuildConfig;

  //#region 生成 package.json
  flag(`generating package.json`);
  /// 将 package.json 的 types 路径进行修改
  const packageJson = await generatePackageJson(root, userConfig1, tsConfig1, {
    logger,
    packageTemplateJson: thePackageJson,
    customTypesRoot: "./typings",
    customDistRoot: `dist/${buildConfig.outSubPath}`,
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
      if (
        contents.length > refSnippet.length &&
        contents.compare(buf, 0, refSnippet.length, 0, refSnippet.length) !== 0
      ) {
        contents.copy(buf, refSnippet.length);
        await writeFile(p, buf);
      }
    }
    success("added type references");
  }

  flag("aggregating package.json");
  const exp = packageJson.exports as any;
  const { aggregatedPackageJson } = options;
  // 对依赖进行聚合操作
  const aggregateDep = (key: keyof $PackageJson) => {
    (aggregatedPackageJson as any)[key] = Object.assign(aggregatedPackageJson[key] ?? {}, packageJson[key]);
    (packageJson as any)[key] = aggregatedPackageJson[key];
  };

  aggregateDep("dependencies");
  aggregateDep("devDependencies");
  aggregateDep("peerDependencies");
  aggregateDep("optionalDependencies");

  if (!aggregatedPackageJson.exports) {
    aggregatedPackageJson.exports = Object.assign({}, packageJson.exports);
  }

  /// 生成package.json的条件导出
  const aggregatedExports = aggregatedPackageJson.exports as any;
  Object.keys(exp).forEach((x) => {
    const exportsObject = exp[x];
    aggregatedExports[x] = Object.assign(
      aggregatedExports[x] ?? {},
      /*
      profiles的项作为导出的key，例如['web','node'] 转换成
      "web":{
        import:"",
        require:"",
        types:""
      },
      "node":{
        import:"",
        require:"",
        types:""
      },
      */
      buildConfig.profiles?.reduce((acc, cur) => {
        const obj = {} as any;
        obj[cur] = exportsObject;
        acc = Object.assign(acc, obj);
        return acc;
      }, {})
    );
  });
  packageJson.exports = aggregatedExports;
  await writeJsonConfig(path.resolve(buildOutDir, "package.json"), packageJson);
  success(`package.json aggregated`);

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
    outSubPath: buildConfig.outSubPath,
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
};

/**
 * 整理出要执行 build 的配置
 * 这是一个递归的过程
 */
const collectBuildConfigs = (rootConfig: Bfsp.UserConfig, configList: Bfsp.BuildConfig[] = []) => {
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
    configList.push({ ...rootConfig, outSubPath: (rootConfig as Bfsp.BuildConfig).outSubPath ?? "./default" });
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

    // 用于给buildSingle提供用于聚合操作的状态
    // 基本逻辑是，buildSingle每次执行，都会使用Object.assign做exports和deps的字段合并
    // 每个buildOutDir为一个聚合基本单位
    const aggregatedPackageJsonMap = new Map<string /*buildOutDir */, $PackageJson>();

    for (const [index, userConfig] of buildUserConfigList.entries()) {
      const buildTitle = chalk.gray(`${userConfig.name}::${userConfig.formats?.[0] ?? "esm"}`);
      buildLogger.prompts.push(buildTitle);
      const startTime = Date.now();
      const taskTitle = `build task: (${index + 1}/${buildUserConfigList.length})`;
      buildLogger.info(`${chalk.blue(">>>")} start ${taskTitle}`);

      {
        /**要输出的文件夹根路径 */
        const buildOutDir = path.resolve(BUILD_OUT_ROOT, userConfig.name!);
        if (!aggregatedPackageJsonMap.has(buildOutDir)) {
          aggregatedPackageJsonMap.set(buildOutDir, {} as any);
        }

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
          aggregatedPackageJson: aggregatedPackageJsonMap.get(buildOutDir)!, // 用来给buildSingle做聚合操作
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
