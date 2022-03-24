import { build, Loader, Plugin } from "@bfchain/pkgm-base/lib/esbuild";
import { $readFromMjs, createTsconfigForEsbuild, DevLogger, fileIO, folderIO, toPosixPath } from "@bfchain/pkgm-bfsp";
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
    { suffix: ".js", loader: "js" },
    { suffix: ".mjs", loader: "js" },
    { suffix: ".json", loader: "json" },
    { suffix: ".cjs", loader: "js" },
    { suffix: ".jsx", loader: "js" },
  ];
  // 用来注入路径信息
  const bfspWrapper: Plugin = {
    name: "#bfsp-wrapper",
    setup(build) {
      build.onResolve(
        {
          filter: /^[.]|#$/,
        },
        (args) => {
          if (/#$/.test(args.path)) {
            return { path: args.path, namespace: "bfsp-wrapper" };
          } else {
            return {
              path: path.join(path.dirname(args.importer), args.path),
              namespace: "bfsp-wrapper",
            };
          }
        }
      );
      build.onLoad(
        {
          filter: /.*/,
          namespace: "bfsp-wrapper",
        },
        async (args) => {
          if (path.basename(args.path) === "#bfsp#") {
            return {
              contents: await fileIO.get(path.join(path.dirname(args.path), "#bfsp.ts")),
              loader: "ts",
            };
          }

          if (path.basename(args.path) === "#bfsp") {
            const bfspDirname = toPosixPath(path.dirname(args.path)); //path.resolve(workspaceRoot, path.dirname(args.path));
            const bfsp_ = JSON.stringify(toPosixPath(path.join(bfspDirname, "#bfsp#")));
            return {
              contents: `
                import defaultValue from ${bfsp_};
                export * from ${bfsp_};
                const newDefault = {...defaultValue,path:${JSON.stringify(bfspDirname)}};
                export default newDefault;
              `,
              loader: "ts",
            };
          }

          let filepath = args.path;
          let loader: Loader = "ts";

          if ((await fileIO.has(filepath)) === false) {
            for (const sl of suffixAndLoaderList) {
              const maybeFilepath = filepath + sl.suffix;
              if (await fileIO.has(maybeFilepath)) {
                filepath = maybeFilepath;
                loader = sl.loader;
                break;
              }
            }
            return {
              contents: await fileIO.get(`${args.path}.ts`),
              loader: "ts",
            };
          }
          return { contents: await fileIO.get(filepath), loader };
        }
      );
    },
  };
  for (const filename of await folderIO.get(workspaceRoot)) {
    if (filename === "#bfsw.ts" || filename === "#bfsw.mts" || filename === "#bfsw.mtsx") {
      const cache_filename = `#bfsw-${createHash("md5").update(`${Date.now()}`).digest("hex")}.mjs`;
      const bfswDir = resolve(workspaceRoot, consts.ShadowRootPath);
      if (!existsSync(bfswDir)) {
        mkdirSync(bfswDir);
      }
      const cache_filepath = resolve(bfswDir, cache_filename);
      try {
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
          plugins: [externalMarker, bfspWrapper],
          watch: options.watch && {
            onRebuild: async (error, result) => {
              debugger;
              if (!error) {
                options.watch!(await $readFromMjs<Bfsw.Workspace>(cache_filepath, logger, true));
              }
            },
          },
        });
        const { single, logger } = options;
        if (single?.aborted) {
          return;
        }
        if (buildResult.stop) {
          single?.addEventListener("abort", buildResult.stop.bind(buildResult));
        } else {
          if (buildResult.warnings) {
            for (const warn of buildResult.warnings) {
              logger.warn(warn.text);
            }
          }
          if (buildResult.errors) {
            for (const err of buildResult.errors) {
              logger.error(err.text);
            }
            return;
          }
        }

        return await $readFromMjs<Bfsw.Workspace>(cache_filepath, logger, true);
      } finally {
        existsSync(cache_filepath) && unlinkSync(cache_filepath);
      }
    }
  }
};
