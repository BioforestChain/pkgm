import { chalk } from "@bfchain/pkgm-base/lib/chalk.mjs";
import { build, Plugin } from "@bfchain/pkgm-base/lib/esbuild.mjs";
import { fileIO, folderIO } from "@bfchain/pkgm-base/toolkit/toolkit.fs.mjs";
import { printBuildResultWarnAndError } from "@bfchain/pkgm-base/toolkit/toolkit.lang.mjs";
import { SharedAsyncIterable, SharedFollower } from "@bfchain/pkgm-base/toolkit/toolkit.stream.mjs";
import { PromiseOut } from "@bfchain/pkgm-base/util/extends_promise_out.mjs";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path, { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import bfspTsconfigJson from "../../../assets/tsconfig.bfsp.json" assert { type: "json" };
import { parseFormats } from "../../helper/js_format.mjs";
import { DebounceLoadConfig } from "../../helper/js_loader.mjs";
import { DevLogger } from "../../sdk/logger/logger.mjs";
import { $BfspEnvConfig } from "../bfspConfig.mjs";
import * as consts from "../consts.mjs";
import { parseExports } from "./bfspUserConfig.parseExports.mjs";

const debug = DevLogger("bfsp:config/#bfsp");

export const createTsconfigForEsbuild = (content: string) => {
  const tsConfigPath = path.join(tmpdir(), `tsconfig.bfsp-${createHash("md5").update(content).digest("hex")}.json`);
  if (existsSync(tsConfigPath) === false) {
    writeFileSync(tsConfigPath, content);
    debug("tsconfigUrl", tsConfigPath);
  }
  return tsConfigPath;
};

const bfspTsconfigFilepath = createTsconfigForEsbuild(JSON.stringify(bfspTsconfigJson));

export const readUserConfig = async (
  projectRoot: string,
  options: {
    unlink?: boolean;
    signal?: AbortSignal;
    watch?: (config: Bfsp.UserConfig) => void;
    logger: PKGM.TuiLogger;
  }
): Promise<Bfsp.UserConfig | undefined> => {
  const { signal, logger, watch } = options;

  for (const filename of await folderIO.get(projectRoot)) {
    if (filename === "#bfsp.ts" || filename === "#bfsp.mts" || filename === "#bfsp.mtsx") {
      const cache_filename = `#bfsp-${createHash("md5").update(`${Date.now()}`).digest("hex")}.mjs`;
      const bfspDir = resolve(projectRoot, consts.ShadowRootPath);
      if (!existsSync(bfspDir)) {
        mkdirSync(bfspDir);
      }
      const cache_filepath = resolve(bfspDir, cache_filename);

      const loadConfig = DebounceLoadConfig<Bfsp.UserConfig>(cache_filepath, logger);

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
        plugins: getBuildPlugins(projectRoot),
        watch: watch && {
          onRebuild: async (error, buildResult) => {
            if (buildResult) {
              printBuildResultWarnAndError(logger, buildResult);
            }
            if (!error) {
              const newConfig = await loadConfig();
              if (newConfig) {
                watch(newConfig);
              }
            }
          },
        },
      });

      if (signal?.aborted) {
        return;
      }

      const hasError = printBuildResultWarnAndError(logger, buildResult);

      if (typeof buildResult.stop === "function") {
        logger.info.pin(`watch:${filename}`, `watching ${chalk.blue(filename)} changes...`);
        // 监听模式
        signal?.addEventListener("abort", buildResult.stop.bind(buildResult));
      } else if (hasError) {
        return;
      }

      return await loadConfig();
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

  /**
   * 如果代码走到这里了，说明没有找到配置文件
   * 如果此时又是watch模式，那么说明根本没有成功执行 build 执行，所以直接抛出异常，
   */
  if (typeof watch === "function") {
    throw new Error("no found #bfsp.ts config!");
  }
};

const getBuildPlugins = (projectRoot: string) => {
  const externalMarker: Plugin = {
    name: "#bfsp resolver",
    setup(build) {
      // #bfsp和#bfsw bundle起来读取
      build.onResolve({ filter: /^[^.]/ }, (args) => {
        return {
          external: true,
        };
      });
    },
  };
  return [externalMarker];
};

export const getBfspUserConfig = (
  dirname = process.cwd(),
  options: {
    refresh?: boolean;
    signal?: AbortSignal;
    watch?: (config: $BfspUserConfig) => void;
    logger: PKGM.Logger;
  }
) => {
  const po = new PromiseOut<$BfspUserConfig>();
  (async () => {
    const { watch } = options;
    const userConfig = await readUserConfig(dirname, {
      ...options,
      watch:
        watch &&
        ((userConfig) => {
          if (po.is_resolved) {
            watch($getBfspUserConfig(userConfig));
          } else {
            po.resolve($getBfspUserConfig(userConfig));
          }
        }),
    });

    /// 非watch模式。直接报错
    if (userConfig === undefined) {
      if (typeof options.watch !== "function") {
        po.reject(new Error("no found #bfsp project"));
      }
    } else {
      po.resolve($getBfspUserConfig(userConfig));
    }
  })();
  return po.promise;
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
  tsRefs: BFChainUtil.PromiseMaybe<Bfsp.TsReference[]> = [];
  dependencies: BFChainUtil.PromiseMaybe<{ [name: string]: string }> = {};
}

export const watchBfspUserConfig = (
  bfspEnvConfig: $BfspEnvConfig,
  options: {
    bfspUserConfigInitPo?: BFChainUtil.PromiseMaybe<$BfspUserConfig>;
    logger: PKGM.Logger;
  }
) => {
  const { projectDirpath } = bfspEnvConfig;
  const follower = new SharedFollower<$BfspUserConfig>();
  const { logger } = options;

  let curBfspUserConfig: $BfspUserConfig | undefined;
  const abortController = new AbortController();
  const abortsignal = abortController.signal;

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
      signal: abortsignal,
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
