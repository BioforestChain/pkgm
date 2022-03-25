import { chalk } from "@bfchain/pkgm-base/lib/chalk";
import { build, BuildResult } from "@bfchain/pkgm-base/lib/esbuild";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path, { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
// import { setFlagsFromString } from "node:v8";
// setFlagsFromString("experimental-vm-modules");
import bfspTsconfigContent from "../../assets/tsconfig.bfsp.json?raw";
import * as consts from "../consts";
import { DevLogger } from "../logger";
import {
  fileIO,
  folderIO,
  parseExtensionAndFormat,
  SharedAsyncIterable,
  SharedFollower,
  toPosixPath,
} from "../toolkit";

const debug = DevLogger("bfsp:config/#bfsp");

// export const enum BUILD_MODE {
//   DEVELOPMENT = "development",
//   PRODUCTION = "production",
// }

export const enum BUILD_MODE {
  DEVELOPMENT = "development",
  PRODUCTION = "production",
}
export const defineConfig = (cb: (info: Bfsp.ConfigEnvInfo) => Bfsp.UserConfig) => {
  new Error().stack;
  return {
    ...cb({
      mode: process.env.mode?.startsWith("prod") ? BUILD_MODE.PRODUCTION : BUILD_MODE.DEVELOPMENT,
    }),
    relativePath: "./",
  };
};

/**为出口的js文件进行自动重命名,寻找一个不冲突的文件名
 * input 与 output 一一对应
 * 但是input可以有别名,这些别名决定着output
 * 别名可以一样
 *
 * input: InputPath
 * output: OutputName
 */
export class ExportsMap {
  readonly oi = new Map<string, string>();
  readonly io = new Map<string, string>();
  hasInput(input: string) {
    return this.io.has(input);
  }
  defineOutput(input: string, output: string) {
    this.oi.set(output, input);
    this.io.set(input, output);
  }
  autoOutput(input: string, inputAlias: string) {
    let output = this.oi.get(input);
    if (output !== undefined) {
      return output;
    }
    let autoNameAcc = 0;
    do {
      output = autoNameAcc === 0 ? inputAlias : `${inputAlias}-${autoNameAcc}`;
      if (this.oi.has(output) === false) {
        break;
      }

      autoNameAcc += Math.ceil(this.oi.size / 2);
    } while (true);

    this.defineOutput(input, output);
    return output;
  }
  getOutput(input: string) {
    return this.io.get(input);
  }
  delInput(input: string) {
    const output = this.io.get(input);
    if (output !== undefined) {
      this.io.delete(input);
      this.oi.delete(output);
      return true;
    }
    return false;
  }
}

export const parseExports = (exports: Bfsp.UserConfig["exports"]) => {
  const exportsMap = new ExportsMap();
  let _index: { posixKey: string; input: string; key: string } | undefined;
  const standardExports: Bfsp.UserConfig["exports"] = { ".": "" };
  /// 先暴露出模块
  for (const key in exports) {
    /**一个格式化后的key, 是用于提供 @bfchain/xxx/{key} 这样的扩展包的 */
    const posixKey = path.posix.normalize(key);
    if (posixKey.startsWith("..")) {
      console.error(`invalid exports key: '${key}'`);
      continue;
    }
    const input: string = toPosixPath((exports as any)[key]);

    let inputAlias = posixKey;
    if (posixKey === "." || posixKey === "./" || posixKey === "") {
      standardExports["."] = input;

      inputAlias = "index";
      if (_index !== undefined) {
        console.error(`duplicated default export: '${posixKey}', will use '.' by default`);
        if (_index.posixKey === ".") {
          continue;
        }
        exportsMap.delInput(_index.input);
      }
      _index = { posixKey, input, key };
    } else {
      if (posixKey in standardExports) {
        console.error(`duplicated default export: '${posixKey}('${key}')'`);
        continue;
      }
      (standardExports as any)[posixKey] = input;
    }

    exportsMap.autoOutput(input, inputAlias);
  }

  if (_index === undefined) {
    throw new Error("no found default export('.')");
  }

  return {
    exportsMap,
    formatedExports: standardExports,
    indexFile: _index.input,
    indexKey: {
      sourceKey: _index.key,
      posixKey: _index.posixKey,
    },
  };
};

export const ALLOW_FORMATS = new Set<Bfsp.JsFormat>(["iife", "cjs", "esm"]);
export const parseFormats = (formats: Bfsp.Format[] = []) => {
  const feList = formats.map((f) => parseExtensionAndFormat(f)).filter((fe) => ALLOW_FORMATS.has(fe.format as any));
  const feMap = new Map(feList.map((fe) => [fe.format + "/" + fe.extension, fe]));
  const validFeList = [...feMap.values()];
  if (validFeList.length === 0) {
    validFeList.push(parseExtensionAndFormat("esm"));
  }
  return validFeList as {
    format: Bfsp.JsFormat;
    extension: Bfsp.JsExtension;
  }[];
};

export const createTsconfigForEsbuild = (content: string) => {
  const tsConfigPath = path.join(tmpdir(), `tsconfig.bfsp-${createHash("md5").update(content).digest("hex")}.json`);
  if (existsSync(tsConfigPath) === false) {
    writeFileSync(tsConfigPath, content);
    debug("tsconfigUrl", tsConfigPath);
  }
  return tsConfigPath;
};

const bfspTsconfigFilepath = createTsconfigForEsbuild(bfspTsconfigContent);

declare module "node:vm" {
  class Module {
    context: any;
    namespace: any;
    identifier: string;
    status: "unlinked" | "linking" | "linked" | "evaluated" | "evaluating" | "errored";
    error?: any;
    evaluate(options?: { timeout?: number; breakOnSigint?: boolean }): Promise<void>;
    link(linker: Linker): Promise<void>;
  }

  type Linker = (specifier: string, referencingModule: Module, extra: {}) => BFChainUtil.PromiseMaybe<Module>;
  class SourceTextModule extends Module {
    constructor(code: string, options: { content: any });
    createCachedData(): Buffer;
  }
}
export const $readFromMjs2 = async <T>(filename: string, logger: PKGM.Logger, refresh?: boolean) => {
  const { SourceTextModule, createContext, Module } = await import("node:vm");

  /// 简单用logger覆盖console
  const customConsole = Object.create(console);
  customConsole.log = logger.log;
  customConsole.info = logger.info;
  customConsole.warn = logger.warn;
  customConsole.error = logger.error;

  const ctx = createContext({
    console: customConsole,
  });
  const script = new SourceTextModule(readFileSync(filename, "utf-8"), { content: ctx });
  await script.link(async (specifier) => {
    const context = await import(specifier);
    const module = new Module();
    module.context = context;
    return module;
    throw new Error(`Unable to resolve dependency: ${specifier}`);
  });
  await script.evaluate();

  const { default: config } = script.namespace;
  return config as T;
};

export const $readFromMjs = async <T>(filename: string, logger: PKGM.Logger, unlink?: boolean) => {
  const url = pathToFileURL(filename);
  url.searchParams.append("_", Date.now().toString());

  try {
    const { default: config } = await import(url.href);
    return config as T;
  } catch (err) {
    logger.error(err);
  } finally {
    if (unlink) {
      existsSync(filename) && unlinkSync(filename);
    }
  }
};

export const printBuildResultWarnAndError = (logger: PKGM.Logger, buildResult: BuildResult) => {
  if (buildResult.warnings.length > 0) {
    for (const warn of buildResult.warnings) {
      logger.warn(warn.text);
    }
  }
  if (buildResult.errors.length > 0) {
    for (const err of buildResult.errors) {
      logger.error(err.text);
    }
    return true;
  }
  return false;
};
export const readUserConfig = async (
  projectRoot: string,
  options: {
    unlink?: boolean;
    single?: AbortSignal;
    watch?: (config: Bfsp.UserConfig) => void;
    logger: PKGM.Logger;
  }
): Promise<Bfsp.UserConfig | undefined> => {
  const { single, logger, watch } = options;

  for (const filename of await folderIO.get(projectRoot)) {
    if (filename === "#bfsp.ts" || filename === "#bfsp.mts" || filename === "#bfsp.mtsx") {
      const cache_filename = `#bfsp-${createHash("md5").update(`${Date.now()}`).digest("hex")}.mjs`;
      const bfspDir = resolve(projectRoot, consts.ShadowRootPath);
      if (!existsSync(bfspDir)) {
        mkdirSync(bfspDir);
      }
      const cache_filepath = resolve(bfspDir, cache_filename);
      try {
        debug("complie #bfsp");
        const buildResult = await build({
          entryPoints: [filename],
          absWorkingDir: projectRoot,
          bundle: true,
          platform: "node",
          format: "esm",
          write: true,
          outfile: cache_filepath,
          tsconfig: bfspTsconfigFilepath,
          watch: watch && {
            onRebuild: async (error, buildResult) => {
              if (buildResult) {
                printBuildResultWarnAndError(logger, buildResult);
              }
              if (!error) {
                const newConfig = await $readFromMjs<Bfsp.UserConfig>(cache_filepath, logger, true);
                if (newConfig) {
                  watch(newConfig);
                }
              }
            },
          },
        });

        if (single?.aborted) {
          return;
        }

        const hasError = printBuildResultWarnAndError(logger, buildResult);

        if (typeof buildResult.stop === "function") {
          logger.info.pin(`watch:${filename}`, `watching for complie ${chalk.blue(filename)} ...`);
          // 监听模式
          single?.addEventListener("abort", buildResult.stop.bind(buildResult));
        } else if (hasError) {
          return;
        }

        return await $readFromMjs<Bfsp.UserConfig>(cache_filepath, logger, options.unlink);
      } catch (err) {
      } finally {
        existsSync(cache_filepath) && unlinkSync(cache_filepath);
      }
    }
    // if (filename === "#bfsp.mjs") {
    //   return await _readFromMjs(filename, options.refresh);
    // }
    if (filename === "#bfsp.json") {
      return JSON.parse(
        (await fileIO.get(resolve(projectRoot, filename), options.unlink)).toString("utf-8")
      ) as Bfsp.UserConfig;
    }
  }
};

export const getBfspUserConfig = async (
  dirname = process.cwd(),
  options: {
    refresh?: boolean;
    single?: AbortSignal;
    watch?: (config: $BfspUserConfig) => void;
    logger: PKGM.Logger;
  }
) => {
  const userConfig = await readUserConfig(dirname, {
    ...options,
    watch:
      options.watch &&
      ((userConfig) => {
        options.watch!($getBfspUserConfig(userConfig));
      }),
  });
  if (userConfig === undefined) {
    throw new Error("no found #bfsp project");
  }
  return $getBfspUserConfig(userConfig);
};
export const $getBfspUserConfig = (userConfig: Bfsp.UserConfig): $BfspUserConfig => {
  return {
    userConfig,
    exportsDetail: parseExports(userConfig.exports),
    formatExts: parseFormats(userConfig.formats),
    extendsService: new ExtendsService(),
  };
};

// ProjectConfig
export type $BfspUserConfig = {
  userConfig: Bfsp.UserConfig;
  exportsDetail: ReturnType<typeof parseExports>;
  formatExts: ReturnType<typeof parseFormats>;
  extendsService: ExtendsService;
};
class ExtendsService {
  tsRefs: BFChainUtil.PromiseMaybe<{ path: string }[]> = [];
}

export const watchBfspUserConfig = (
  projectDirpath: string,
  options: {
    bfspUserConfigInitPo?: BFChainUtil.PromiseMaybe<$BfspUserConfig>;
    logger: PKGM.Logger;
  }
) => {
  const follower = new SharedFollower<$BfspUserConfig>();
  const { logger } = options;

  let curBfspUserConfig: $BfspUserConfig | undefined;
  const abortController = new AbortController();
  const abortSingle = abortController.signal;

  (async () => {
    if (curBfspUserConfig === undefined) {
      // 初始的值 放出来
      if (options.bfspUserConfigInitPo) {
        follower.push((curBfspUserConfig = await options.bfspUserConfigInitPo));
      }
    }

    if (!existsSync(projectDirpath)) {
      logger.error("unable to read bfsp user config: '%s' maybe removed", chalk.blue(projectDirpath));
      return;
    }
    const tryPushUserConfig = (userConfig: Bfsp.UserConfig) => {
      if (isDeepStrictEqual(curBfspUserConfig?.userConfig, userConfig)) {
        return;
      }
      debug("bfspuserConfig changed!!");
      follower.push((curBfspUserConfig = $getBfspUserConfig(userConfig)));
    };

    const userConfig = await readUserConfig(projectDirpath, {
      unlink: true,
      single: abortSingle,
      watch: tryPushUserConfig,
      logger,
    });
    if (userConfig !== undefined) {
      tryPushUserConfig(userConfig);
    }
  })();

  /// 转成异步迭代器
  const sai = new SharedAsyncIterable<$BfspUserConfig>(follower);
  sai.onStop(() => {
    abortController.abort();
  }, true);
  return sai;
};
