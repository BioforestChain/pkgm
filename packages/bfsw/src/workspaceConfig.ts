import path, { resolve } from "node:path";
import { createTsconfigForEsbuild, Debug, fileIO, folderIO, toPosixPath, _readFromMjs } from "@bfchain/pkgm-bfsp";
import { Plugin, build } from "esbuild";
import { existsSync, unlinkSync } from "node:fs";
import bfswTsconfigContent from "../assets/tsconfig.bfsw.json?raw";

export const defineWorkspace = (cb: () => Bfsw.Workspace) => {
  return cb();
};

const bfswTsconfigFilepath = createTsconfigForEsbuild(bfswTsconfigContent);


export const readWorkspaceConfig = async (
  dirname: string,
  options: {
    refresh?: boolean;
  }
) => {
  const log = Debug("bfsp:config/#bfsp");
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
              contents: await fileIO.get(
                path.join(path.dirname(args.path), "#bfsp.ts")
              ),
              loader: "ts",
            };
          }

          if (path.basename(args.path) === "#bfsp") {
            const bfsp_ = JSON.stringify(
              toPosixPath(path.join(path.dirname(args.path), "#bfsp#"))
            );
            const dirname = toPosixPath(path.dirname(args.path));
            return {
              contents: `
                            import defaultValue from ${bfsp_};
                            export * from ${bfsp_};
                            const newDefault = {...defaultValue,path:"${dirname}"};
                            export default newDefault;
                            `,
              loader: "ts",
            };
          }
          if (path.basename(args.path) === "#bfsw") {
            return {
              contents: await fileIO.get(`${args.path}.ts`),
              loader: "ts",
            };
          }
          return { contents: await fileIO.get(args.path), loader: "ts" };
        }
      );
    },
  };
  for (const filename of await folderIO.get(dirname)) {
    if (
      filename === "#bfsw.ts" ||
      filename === "#bfsw.mts" ||
      filename === "#bfsw.mtsx"
    ) {
      const cache_filename = `#bfsw.mjs`;
      const cache_filepath = resolve(dirname, cache_filename);
      try {
        log("complie #bfsw");
        await build({
          entryPoints: [filename],
          absWorkingDir: dirname,
          bundle: true,
          platform: "node",
          format: "esm",
          write: true,
          outfile: cache_filepath,
          tsconfig: bfswTsconfigFilepath,
          plugins: [externalMarker, bfspWrapper],
        });
        return await _readFromMjs<Bfsw.Workspace>(
          cache_filepath,
          options.refresh
        );
      } finally {
        existsSync(cache_filepath) && unlinkSync(cache_filepath);
      }
    }
    // if (filename === "#bfsw.mjs") {
    //   return await _readFromMjs(filename, options.refresh);
    // }
    if (filename === "#bfsw.json") {
      return JSON.parse(
        (
          await fileIO.get(resolve(dirname, filename), options.refresh)
        ).toString("utf-8")
      ) as Bfsw.Workspace;
    }
  }
};