import { build, BuildResult, Loader, Plugin } from "@bfchain/pkgm-base/lib/esbuild";
import { chalk } from "@bfchain/pkgm-base/lib/chalk";
import {
  $readFromMjs,
  createTsconfigForEsbuild,
  DevLogger,
  fileIO,
  folderIO,
  toPosixPath,
  printBuildResultWarnAndError,
} from "@bfchain/pkgm-bfsp";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import path, { resolve } from "node:path";
import { consts } from "../consts";
import bfswTsconfigContent from "../../assets/tsconfig.bfsw.json?raw";
const bfswTsconfigFilepath = createTsconfigForEsbuild(bfswTsconfigContent);

export const defineWorkspace = (cb: () => Bfsw.Workspace) => {
  return cb();
};

export const LoadConfig = async (
  workspaceRoot: string,
  options: {
    single?: AbortSignal;
    watch?: (config: Bfsw.Workspace) => void;
    logger: PKGM.Logger;
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
              const newConfig = await $readFromMjs<Bfsw.Workspace>(cache_filepath, logger, true);
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
        logger.info.pin(`watch:${filename}`, `watching ${chalk.blue(filename)} changes...`);
        // 监听模式
        single?.addEventListener("abort", buildResult.stop.bind(buildResult));
      } else if (hasError) {
        return;
      }

      return await $readFromMjs<Bfsw.Workspace>(cache_filepath, logger, true);
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
  const externalMarker: Plugin = {
    name: "#bfsw resolver",
    setup(build) {
      // #bfsp和#bfsw bundle起来读取
      build.onResolve({ filter: /^[^.]/ }, (args) => {
        return {
          external: true,
        };
      });
    },
  };
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
          if (args.path.includes("#bfsp")) {
            if (path.basename(args.path) === "#bfsp#") {
              /// 私有的#bfsp#路径，指代真实的#bfsp#
              return {
                path: args.path,
                namespace: "bfsp-wrapper",
                pluginData: {
                  type: "#bfsp#",
                },
              };
            } else {
              /// 寻找匹配的文件
              let filepath = args.path;
              let loader: Loader | undefined;
              if ((await fileIO.has(filepath)) === false) {
                for (const sl of suffixAndLoaderList) {
                  const maybeFilepath = filepath + sl.suffix;
                  if (await fileIO.has(path.resolve(workspaceRoot, maybeFilepath))) {
                    filepath = maybeFilepath;
                    loader = sl.loader;
                    break;
                  }
                }
              }
              if (loader !== undefined) {
                return {
                  path: filepath,
                  namespace: "bfsp-wrapper",
                  watchFiles: [path.resolve(workspaceRoot, filepath)],
                  pluginData: {
                    type: "#bfsp",
                    loader,
                  },
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
          const { type } = args.pluginData;
          if (type === "#bfsp#") {
            return {
              contents: await fileIO.get(path.resolve(workspaceRoot, path.dirname(args.path), "#bfsp.ts")),
              loader: "ts",
            };
          } else if (type === "#bfsp") {
            const bfspDirname = toPosixPath(path.dirname(args.path));
            const bfspTrue = JSON.stringify(toPosixPath(path.join(bfspDirname, "#bfsp#")));
            return {
              contents: `
              export * from ${bfspTrue};
              import defaultValue from ${bfspTrue};
              const newDefault = Object.assign(defaultValue ?? {}, { relativePath:${JSON.stringify(bfspDirname)} });
              export default newDefault;
              `,
              loader: "ts",
            };
          }
        }
      );
    },
  };
  return [externalMarker, bfspWrapper];
};
