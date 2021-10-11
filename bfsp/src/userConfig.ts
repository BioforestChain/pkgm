import { readFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { folderIO, fileIO } from "./toolkit";

// export const enum BUILD_MODE {
//   DEVELOPMENT = "development",
//   PRODUCTION = "production",
// }

export const enum BUILD_MODE {
  DEVELOPMENT = "development",
  PRODUCTION = "production",
}
export const defineConfig = (
  cb: (info: Bfsp.ConfigEnvInfo) => Bfsp.UserConfig
) => {
  return cb({
    mode: process.env.mode?.startsWith("prod")
      ? BUILD_MODE.PRODUCTION
      : BUILD_MODE.DEVELOPMENT,
  });
};

export const getBfspUserConfig = async (dirname = process.cwd()) => {
  for (const filename of await folderIO.get(dirname)) {
    if (filename === "#bfsp.ts") {
      const cache_filename = `#bfsp.mjs`;
      const cache_filepath = resolve(dirname, cache_filename);
      await build({
        entryPoints: [filename],
        absWorkingDir: dirname,
        bundle: false,
        platform: "node",
        format: "esm",
        write: true,
        // outdir: dirname,
        outfile: cache_filepath,
        // incremental: true,
      });
      try {
        const { default: config } = await import(
          pathToFileURL(cache_filepath).href
        );
        return config as Bfsp.UserConfig;
      } finally {
        await unlink(cache_filepath);
      }
    }
    if (filename === "#bfsp.json") {
      return JSON.parse(
        (await fileIO.get(resolve(dirname, filename))).toString("utf-8")
      ) as Bfsp.UserConfig;
    }
  }
  //   throw "no found bfsp config";
};
