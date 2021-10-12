import { readFile, unlink } from "node:fs/promises";
import path, { resolve } from "node:path";
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

/**为出口的js文件进行自动重命名,寻找一个不冲突的文件名
 * input 与 output 一一对应
 * 但是input可以有别名,这些别名决定着output
 * 别名可以一样
 */
export class ExportsMap {
  readonly oi_cache = new Map<string, string>();
  readonly io_cache = new Map<string, string>();
  hasDefine(input: string) {
    return this.io_cache.has(input);
  }
  define(input: string, output: string) {
    this.oi_cache.set(output, input);
    this.io_cache.set(input, output);
  }
  autoDefine(input: string, inputAlias: string) {
    let output = this.oi_cache.get(input);
    if (output !== undefined) {
      return output;
    }
    let autoNameAcc = 0;
    do {
      output = autoNameAcc === 0 ? inputAlias : `${inputAlias}-${autoNameAcc}`;
      if (this.oi_cache.has(output) === false) {
        break;
      }

      autoNameAcc += Math.ceil(this.oi_cache.size / 2);
    } while (true);

    this.define(input, output);
    return output;
  }
  getDefine(input: string) {
    return this.io_cache.get(input);
  }
  delDefine(input: string) {
    const output = this.io_cache.get(input);
    if (output !== undefined) {
      this.io_cache.delete(input);
      this.oi_cache.delete(output);
      return true;
    }
    return false;
  }
}

export const parseExports = (exports: Bfsp.UserConfig["exports"]) => {
  const exportsMap = new ExportsMap();
  let _index: { posixKey: string; input: string; key: string } | undefined;
  /// 先暴露出模块
  for (const key in exports) {
    /**一个格式化后的key, 是用于提供 @bfchain/xxx/{key} 这样的扩展包的 */
    const posixKey = path.posix.normalize(key);
    if (posixKey.startsWith("..")) {
      console.error(`invalid exports key: '${key}'`);
      continue;
    }
    const input: string = (exports as any)[key];

    let inputAlias = posixKey;
    if (posixKey === "." || posixKey === "./" || posixKey === "") {
      inputAlias = "index";
      if (_index !== undefined) {
        console.error(
          `duplicated default export: '${posixKey}', will use '.' by default`
        );
        if (_index.posixKey === ".") {
          continue;
        }
        exportsMap.delDefine(_index.input);
      }
      _index = { posixKey, input, key };
    }

    exportsMap.autoDefine(input, posixKey);
  }

  if (_index === undefined) {
    throw new Error("no found default export('.')");
  }

  return {
    exportsMap,
    indexFile: _index.input,
    indexKey: {
      sourceKey: _index.key,
      posixKey: _index.posixKey,
    },
  };
};

export const readUserConfig = async (
  dirname: string,
  options: {
    refresh?: boolean;
  }
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
        existsSync(cache_filepath) && (await unlink(cache_filepath));
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
};

export const getBfspUserConfig = async (
  dirname = process.cwd(),
  options: {
    refresh?: boolean;
  } = {}
) => {
  const userConfig = await readUserConfig(dirname, options);
  if (userConfig === undefined) {
    throw new Error("no found #bfsp project");
  }
  return _getBfspUserConfig(userConfig);
};
const _getBfspUserConfig = (userConfig: Bfsp.UserConfig) => {
  return {
    userConfig,
    exportsDetail: parseExports(userConfig.exports),
  };
};

export type $BfspUserConfig = BFChainUtil.PromiseReturnType<
  typeof getBfspUserConfig
>;

import chokidar from "chokidar";
import { PromiseOut } from "@bfchain/util-extends-promise-out";
import { isDeepStrictEqual } from "node:util";
import { existsSync } from "node:fs";
async function* _watchBfspUserConfig(
  projectDirpath: string,
  bfspUserConfigInitPo: BFChainUtil.PromiseMaybe<$BfspUserConfig>
) {
  const watcher = chokidar.watch(["#bfsp.json", "#bfsp.ts"], {
    cwd: projectDirpath,
    ignoreInitial: false,
  });
  let waitter = new PromiseOut<{ event: string; path: string }>();
  watcher.on("change", (path) => waitter.resolve({ event: "change", path }));
  watcher.on("add", (path) => waitter.resolve({ event: "add", path }));

  let curBfspUserConfig = await bfspUserConfigInitPo;
  yield curBfspUserConfig; // 初始的值要放出来

  while (true) {
    const event = await waitter.promise;
    console.log(event);
    waitter = new PromiseOut();

    const userConfig = await readUserConfig(projectDirpath, {
      refresh: true,
    });
    if (userConfig !== undefined) {
      if (isDeepStrictEqual(curBfspUserConfig?.userConfig, userConfig)) {
        continue;
      }
      yield (curBfspUserConfig = _getBfspUserConfig(userConfig));
    }
  }
}
export const watchBfspUserConfig = (
  projectDirpath: string,
  bfspUserConfigInitPo: BFChainUtil.PromiseMaybe<$BfspUserConfig>
) => _watchBfspUserConfig(projectDirpath, bfspUserConfigInitPo).toSharable();
