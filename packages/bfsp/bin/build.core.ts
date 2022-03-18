import { chalk } from "@bfchain/pkgm-base/lib/chalk";
import { build as buildBfsp } from "@bfchain/pkgm-base/lib/vite";
import { existsSync } from "node:fs";
import { copyFile, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { inspect } from "node:util";
import { $BfspUserConfig, getBfspUserConfig, parseExports, parseFormats } from "../src";
import { writeBfspProjectConfig } from "../src/bfspConfig";
import { BuildService } from "../src/buildService";
import { $PackageJson, generatePackageJson } from "../src/configs/packageJson";
import { generateTsConfig, writeTsConfig } from "../src/configs/tsConfig";
import { generateViteConfig } from "../src/configs/viteConfig";
import * as consts from "../src/consts";
import { createTscLogger, createViteLogger, Debug } from "../src/logger";
import { fileIO, folderIO, toPosixPath, walkFiles } from "../src/toolkit";
import { getTui, PanelStatus } from "../src/tui/index";
import { runTerser } from "./terser/runner";
import { runTsc } from "./tsc/runner";
import { writeJsonConfig } from "./util";
import { ViteConfigFactory } from "./vite/configFactory";
import { runYarn } from "./yarn/runner";
const jsonClone = <T>(obj: T) => JSON.parse(JSON.stringify(obj)) as T;
const debug = Debug("bfsp:bin/build");

export const writeBuildConfigs = async (options: { root?: string; buildService: BuildService }) => {
  const { root = process.cwd(), buildService } = options;
  const bfspUserConfig = await getBfspUserConfig(root);
  const projectConfig = { projectDirpath: root, bfspUserConfig };
  const subConfigs = await writeBfspProjectConfig(projectConfig, buildService);
  return { subConfigs, bfspUserConfig };
};
export const installBuildDeps = async (options: { root: string }) => {
  const { root } = options;
  const depsPanel = getTui().getPanel("Deps");
  depsPanel.updateStatus("loading");
  const isSuccess = await runYarn({
    root,
    onMessage: (s) => depsPanel.log(s),
    onFlag: (s, loading) => {
      if (typeof loading === "number") {
        s = (loading * 100).toFixed(2) + "% " + s;
      } else {
        s = "... " + s;
      }
      depsPanel.line(s);
    },
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

type StringLogger = (msg: string) => void;
type SimpleLogger = (msg: unknown) => void;

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
  buildService: BuildService;
}) => {
  const tscLogger = createTscLogger();
  const viteLogger = createViteLogger();
  const {
    //
    root,
    buildService,
    thePackageJson,
    buildOutDir,
    bfspUserConfig,
  } = options;
  const buildConfig = bfspUserConfig.userConfig;
  const { debug, flag, success, info, warn, error } = options.buildLogger;

  const userConfig1 = {
    userConfig: buildConfig,
    exportsDetail: parseExports(buildConfig.exports),
    formatExts: parseFormats(buildConfig.formats),
  };
  flag(`generating tsconfig.json`);
  const tsConfig1 = await generateTsConfig(root, userConfig1, buildService, {
    outDirRoot: path.relative(root, buildOutDir),
    outDirName: "source",
  });
  tsConfig1.isolatedJson.compilerOptions.emitDeclarationOnly = true;
  flag(`setting tsconfig.json`);
  await writeTsConfig(root, userConfig1, tsConfig1);
  success(`set tsconfig.json`);

  //#region 生成 package.json
  flag(`generating package.json`);
  /// 将 package.json 的 types 路径进行修改
  const packageJson = await generatePackageJson(root, bfspUserConfig, tsConfig1, {
    packageTemplateJson: thePackageJson,
  });
  await writeJsonConfig(path.resolve(root, "package.json"), packageJson);
  //#region 安装依赖
  debugger;
  flag(`installing dependencies`);
  await installBuildDeps({ root });
  success(`installed dependencies`);
  //#endregion

  /// 写入package.json
  flag(`writing package.json`);
  Reflect.deleteProperty(packageJson, "scripts");
  Reflect.deleteProperty(packageJson, "private");
  await writeJsonConfig(path.resolve(buildOutDir, "package.json"), packageJson);
  success(`writed package.json`);
  //#endregion

  //#region 编译typescript，生成 typings
  {
    flag(`compiling typescript codes`);
    const generateTypings = new Promise<void>((resolve) => {
      const tsc = runTsc({
        tsconfigPath: path.resolve(path.join(root, "tsconfig.isolated.json")),
        projectMode: true,
        onMessage: (x) => {
          tscLogger.write(x);
        },
        onClear: () => tscLogger.clear(),
        onExit: resolve,
        watch: true,
        onErrorFound: (count) => {
          warn(`please fix the ${count} errors. then build will continue.`);
        },
        onSuccess: () => {
          tsc.stop();
        },
      });
    });
    await generateTypings;
    success(`compiled typescript codes`);

    /// 按需拷贝 typings 文件
    const tscSafeRoot = path.resolve(buildOutDir, "source");
    // 一个项目的类型文件只需要生成一次，也只支持一套类型文件
    if (folderIO.has(tscSafeRoot) === false) {
      flag("copying typescript declaration files");
      const tscOutRoot = tsConfig1.json.compilerOptions.outDir;
      for await (const filepath of walkFiles(tscOutRoot, { refreshCache: true })) {
        if (filepath.endsWith(".d.ts") && filepath.endsWith(".test.d.ts") === false) {
          const destFilepath = path.resolve(buildOutDir, "source", path.relative(tscOutRoot, filepath));
          await folderIO.tryInit(path.dirname(destFilepath));
          await copyFile(filepath, destFilepath);
          await rePathProfileImports(
            tsConfig1.json.compilerOptions.paths,
            path.join(buildOutDir, "source/isolated"),
            destFilepath
          );
        }
      }
      success(`copying typescript declaration files`);
    }
  }
  //#endregion

  //#region 使用 vite(rollup+typescript+esbuild) 编译打包代码
  flag(`generating bundle config`);
  const viteConfig1 = await generateViteConfig(root, userConfig1, tsConfig1);
  const jsBundleConfig = ViteConfigFactory({
    buildService,
    userConfig: buildConfig,
    projectDirpath: root,
    viteConfig: viteConfig1,
    tsConfig: tsConfig1,
    outRoot: buildOutDir,
  });
  const distDir = jsBundleConfig.build!.outDir!;

  /// vite 打包
  flag(`bundling javascript codes`);
  await buildBfsp({
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
    logLevel: "warn", // 防止vite干扰tui界面， @todo: 劫持console或者process
    mode: "production",
    customLogger: viteLogger,
  });
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

const msgStringify = (msg: unknown) => {
  if (typeof msg === "string") {
    return msg;
  }
  return inspect(msg, { colors: true });
};

class BuildLogger {
  constructor(
    public prompts: string[] = [],
    private readonly bundlePanel = getTui().getPanel("Bundle"),
    private readonly statusBar = getTui().status
  ) {}

  private get _prompt() {
    return this.prompts[this.prompts.length - 1] || "";
  }
  success = (msg: unknown) => {
    this.bundlePanel.write("info", `${this._prompt} ${chalk.green("✔")} ${msgStringify(msg)}`);
  };
  info = (msg: unknown) => {
    this.bundlePanel.write("info", `${this._prompt} ${msgStringify(msg)}`);
  };
  warn = (msg: unknown) => {
    this.bundlePanel.write("warn", `${this._prompt} ${chalk.yellow("!")} ${msgStringify(msg)}`);
  };
  error = (msg: unknown) => {
    this.bundlePanel.write("error", `${this._prompt} ${chalk.red("❌")} ${msgStringify(msg)}`);
  };
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

export const doBuild = async (options: {
  root?: string;
  format?: Bfsp.Format;
  buildService: BuildService;
  cfgs: Awaited<ReturnType<typeof writeBuildConfigs>>;
}) => {
  const { root = process.cwd(), format, buildService, cfgs } = options; //fs.existsSync(maybeRoot) && fs.statSync(maybeRoot).isDirectory() ? maybeRoot : cwd;
  const { subConfigs, bfspUserConfig } = cfgs;
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
          buildService,
        });

        await buildService.afterSingleBuild({ buildOutDir, config: userConfig });
      }

      const buildTimeSpan = chalk.cyan("+" + (Date.now() - startTime) + "ms");
      buildLogger.info(`${chalk.green(">>>")} finished ${taskTitle} ${buildTimeSpan}`);
      buildLogger.prompts.pop();
    }
    buildLogger.flag("build finished", false);
    buildLogger.updateStatus("success");
  } catch (e) {
    buildLogger.error(e);
  }
};
