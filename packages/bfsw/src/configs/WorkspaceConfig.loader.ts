import { chalk } from "@bfchain/pkgm-base/lib/chalk";
import { build, Loader, Plugin } from "@bfchain/pkgm-base/lib/esbuild";
import {
  createTsconfigForEsbuild,
  DebounceLoadConfig,
  DevLogger,
  fileIO,
  folderIO,
  printBuildResultWarnAndError,
  toPosixPath,
} from "@bfchain/pkgm-bfsp/sdk";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import path, { resolve } from "node:path";
import bfswTsconfigContent from "../../assets/tsconfig.bfsw.json?raw";
import { consts } from "../consts";
const bfswTsconfigFilepath = createTsconfigForEsbuild(bfswTsconfigContent);

export const LoadConfig = async (
  workspaceRoot: string,
  options: {
    single?: AbortSignal;
    watch?: (config: Bfsw.Workspace) => void;
    logger: PKGM.TuiLogger;
  }
) => {
  const debug = DevLogger("bfsw:config/load");

  const { single, logger, watch } = options;

  for (const filename of await folderIO.get(workspaceRoot)) {
    if (filename === "#bfsw.ts" || filename === "#bfsw.mts" || filename === "#bfsw.mtsx") {
      const cache_filename = `#bfsw-${createHash("md5").update(`${Date.now()}`).digest("hex")}.mjs`;
      const bfswDir = resolve(workspaceRoot, consts.ShadowRootPath);
      if (!existsSync(bfswDir)) {
        mkdirSync(bfswDir);
      }
      const cache_filepath = resolve(bfswDir, cache_filename);
      debug("complie #bfsw");

      const _loadConfig = DebounceLoadConfig<Bfsw.Workspace>(cache_filepath, logger);
      const loadConfig = async (...args: BFChainUtil.AllArgument<typeof _loadConfig>) => {
        const res = await _loadConfig(...args);
        if (res !== undefined) {
          logger.error.unpin("load-workspace");
        }
        return res;
      };
      const handleError = (e: any) => {
        logger.error.pin("load-workspace", e.message ?? e);
      };

      try {
        const buildResult = await build({
          entryPoints: [filename],
          absWorkingDir: workspaceRoot,
          bundle: true,
          platform: "node",
          format: "esm",
          write: true,
          outfile: cache_filepath,
          tsconfig: bfswTsconfigFilepath,
          plugins: getBuildPlugins(workspaceRoot),
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
              } else {
                handleError(error);
              }
            },
          },
        });
        if (single?.aborted) {
          return;
        }

        const hasError = printBuildResultWarnAndError(logger, buildResult);

        if (typeof buildResult.stop === "function") {
          logger.info.pin(`watch:${filename}`, `watching ${chalk.blue(filename)} changes...`);
          // 监听模式
          single?.addEventListener("abort", buildResult.stop.bind(buildResult));
        } else if (hasError) {
          return;
        }
        return await loadConfig();
      } catch (e) {
        handleError(e);
        return;
      }
    }

    /**
     * 如果代码走到这里了，说明没有找到配置文件
     * 如果此时又是watch模式，那么说明根本没有成功执行 build 执行，所以直接抛出异常，
     */
    if (typeof watch === "function") {
      throw new Error("no found #bfsw.ts config!");
    }
  }
};

const getBuildPlugins = (workspaceRoot: string) => {
  // const externalMarker: Plugin = {
  //   name: "#bfsw resolver",
  //   setup(build) {
  //     // #bfsp和#bfsw bundle起来读取
  //     build.onResolve({ filter: /^[^.]/ }, (args) => {
  //       return {
  //         external: true,
  //       };
  //     });
  //   },
  // };
  // const resolvePlugin: Plugin ={
  //       name: "#bfsw resolver",
  //   setup(build) {
  //     // #bfsp和#bfsw bundle起来读取
  //     build.onResolve({ filter: /^[^.]/ }, (args) => {
  //       return {
  //         external: true,
  //       };
  //     });
  //   },
  // }
  const suffixAndLoaderList: {
    suffix: string;
    loader: Loader;
  }[] = [
    { suffix: ".ts", loader: "ts" },
    { suffix: ".tsx", loader: "ts" },
  ];
  // 用来注入路径信息
  const bfspWrapper: Plugin = {
    name: "#bfsp-wrapper",
    setup(build) {
      build.onResolve(
        {
          filter: /^[.]|#$/,
        },
        async (args) => {
          const pluginData = {
            type: "",
            loader: "ts",
            // resolveDir 要传递下去，为esbuild指定 node.resolve 所需的根目录，以避免找不到 node_modules 中的模块问题
            resolveDir: args.resolveDir,
          };
          if (args.path.includes("#bfsp")) {
            if (path.basename(args.path) === "#bfsp#") {
              /// 私有的#bfsp#路径，指代真实的#bfsp#
              pluginData.type = "#bfsp#";
              return {
                path: args.path,
                namespace: "bfsp-wrapper",
                pluginData,
              };
            } else {
              /// 寻找匹配的文件
              let filepath = args.path;
              let loader: Loader | undefined;
              if ((await fileIO.has(filepath)) === false) {
                for (const sl of suffixAndLoaderList) {
                  const maybeFilepath = filepath + sl.suffix;
                  if (await fileIO.has(path.resolve(args.resolveDir, maybeFilepath))) {
                    filepath = maybeFilepath;
                    loader = sl.loader;
                    break;
                  }
                }
              }
              if (loader !== undefined) {
                pluginData.type = "#bfsp";
                const resolvedPath = path.resolve(args.resolveDir, filepath);
                return {
                  path: resolvedPath,
                  namespace: "bfsp-wrapper",
                  watchFiles: [resolvedPath],
                  pluginData,
                };
              }
            }
          }
        }
      );
      build.onLoad(
        {
          filter: /.*/,
          namespace: "bfsp-wrapper",
        },
        async (args) => {
          const { type, resolveDir, loader } = args.pluginData;
          if (type === "#bfsp#") {
            return {
              contents: await fileIO.get(path.resolve(workspaceRoot, path.dirname(args.path), "#bfsp.ts")),
              loader,
              resolveDir,
            };
          } else if (type === "#bfsp") {
            const relPath = toPosixPath(path.relative(workspaceRoot, args.path));
            /// 这里的路径时代码里头的风格，本来就是 posix 风格，不需要改动。这里 toPosixPath 只是为了补上相对路径 "./" ，如果需要的话
            const bfspDirname = toPosixPath(path.posix.dirname(relPath));
            const bfspTrue = JSON.stringify(toPosixPath(path.posix.join(bfspDirname, "#bfsp#")));
            return {
              contents: `
              export * from ${bfspTrue};
              import defaultValue from ${bfspTrue};
              const newDefault = Object.assign(defaultValue ?? {}, { relativePath:${JSON.stringify(bfspDirname)} });
              export default newDefault;
              `,
              loader,
              resolveDir,
            };
          }
        }
      );
    },
  };
  // return [externalMarker, bfspWrapper];
  return [bfspWrapper];
};
