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

export const getBfspUserConfig = async (
  dirname = process.cwd(),
  options: {
    refresh?: boolean;
  } = {}
) => {
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
        const url = pathToFileURL(cache_filepath);
        if (options.refresh) {
          url.searchParams.append("_", Date.now().toString());
        }
        const { default: config } = await import(url.href);
        return config as Bfsp.UserConfig;
      } finally {
        await unlink(cache_filepath);
      }
    }
    if (filename === "#bfsp.json") {
      return JSON.parse(
        (
          await fileIO.get(resolve(dirname, filename), options.refresh)
        ).toString("utf-8")
      ) as Bfsp.UserConfig;
    }
  }
  //   throw "no found bfsp config";
};

import chokidar from "chokidar";
import { PromiseOut } from "@bfchain/util-extends-promise-out";
import { isDeepStrictEqual } from "node:util";
async function* _watchBfspUserConfig(
  projectDirpath: string,
  userConfigInitPo: BFChainUtil.PromiseMaybe<Bfsp.UserConfig>
) {
  const watcher = chokidar.watch(["#bfsp.json", "#bfsp.ts"], {
    cwd: projectDirpath,
    ignoreInitial: false,
  });
  let waitter = new PromiseOut<{ event: string; path: string }>();
  watcher.on("change", (path) => waitter.resolve({ event: "change", path }));
  watcher.on("add", (path) => waitter.resolve({ event: "add", path }));

  let curUserConfig = await userConfigInitPo;
  yield curUserConfig; // 初始的值要放出来

  while (true) {
    const event = await waitter.promise;
    console.log(event);
    waitter = new PromiseOut();

    const userConfig = await getBfspUserConfig(projectDirpath, {
      refresh: true,
    });
    if (userConfig !== undefined) {
      if (isDeepStrictEqual(curUserConfig, userConfig)) {
        continue;
      }
      yield (curUserConfig = userConfig);
    }
  }
}
export const watchBfspUserConfig = (
  projectDirpath: string,
  userConfigInitPo: BFChainUtil.PromiseMaybe<Bfsp.UserConfig>
) => _watchBfspUserConfig(projectDirpath, userConfigInitPo).toSharable();
