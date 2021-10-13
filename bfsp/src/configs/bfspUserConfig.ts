import chokidar from "chokidar";
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path, { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import bfspTsconfigContent from "../../assets/tsconfig.bfsp.json?raw";
import { fileIO, folderIO, Loopable, SharedAsyncIterable, SharedFollower, toPosixPath } from "../toolkit";
import debug from "debug";
const log = debug("bfsp:config/#bfsp");

// export const enum BUILD_MODE {
//   DEVELOPMENT = "development",
//   PRODUCTION = "production",
// }

export const enum BUILD_MODE {
  DEVELOPMENT = "development",
  PRODUCTION = "production",
}
export const defineConfig = (cb: (info: Bfsp.ConfigEnvInfo) => Bfsp.UserConfig) => {
  return cb({
    mode: process.env.mode?.startsWith("prod") ? BUILD_MODE.PRODUCTION : BUILD_MODE.DEVELOPMENT,
  });
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

const ALLOW_FORMATS = new Set<Bfsp.Format>(["iife", "cjs", "esm"]);
const parseFormats = (formats: Bfsp.UserConfig["formats"] = []) => {
  const formatSet = new Set(formats.filter((f) => ALLOW_FORMATS.has(f)));
  formats = [...formatSet];
  if (formats.length === 0) {
    formats.push("esm");
  }
  return formats;
};

const bfspTsconfigFilepath = path.join(
  tmpdir(),
  `tsconfig.bfsp-${createHash("md5").update(bfspTsconfigContent).digest("hex")}.json`
);
if (existsSync(bfspTsconfigFilepath) === false) {
  writeFileSync(bfspTsconfigFilepath, bfspTsconfigContent);
  log("tsconfigUrl", bfspTsconfigFilepath);
}

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
      try {
        await build({
          entryPoints: [filename],
          absWorkingDir: dirname,
          bundle: false,
          platform: "node",
          format: "esm",
          write: true,
          outfile: cache_filepath,
          tsconfig: bfspTsconfigFilepath,
        });
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
        (await fileIO.get(resolve(dirname, filename), options.refresh)).toString("utf-8")
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
    formats: parseFormats(userConfig.formats),
  };
};

export type $BfspUserConfig = BFChainUtil.PromiseReturnType<typeof getBfspUserConfig>;

export const watchBfspUserConfig = (
  projectDirpath: string,
  options: {
    bfspUserConfigInitPo?: BFChainUtil.PromiseMaybe<$BfspUserConfig>;
  } = {}
) => {
  const follower = new SharedFollower<$BfspUserConfig>();

  let curBfspUserConfig: $BfspUserConfig | undefined;

  const looper = Loopable(async () => {
    if (curBfspUserConfig === undefined) {
      // 初始的值 放出来
      follower.push((curBfspUserConfig = await (options.bfspUserConfigInitPo ?? getBfspUserConfig(projectDirpath))));
    }

    const userConfig = await readUserConfig(projectDirpath, {
      refresh: true,
    });
    if (userConfig !== undefined) {
      if (isDeepStrictEqual(curBfspUserConfig?.userConfig, userConfig)) {
        return;
      }
      log("bfspuserConfig changed!!");
      follower.push((curBfspUserConfig = _getBfspUserConfig(userConfig)));
    }
  });

  /// 监听配置用户的配置文件
  const watcher = chokidar.watch(["#bfsp.json", "#bfsp.ts", "#bfsp.mts", "#bfsp.mtsx"], {
    cwd: projectDirpath,
    ignoreInitial: false,
  });
  watcher.on("change", looper.loop);
  watcher.on("add", looper.loop);

  looper.loop();
  return new SharedAsyncIterable<$BfspUserConfig>(follower);
};
