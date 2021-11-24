import { build } from "esbuild";
import { createHash } from "node:crypto";
import { existsSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path, { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import bfspTsconfigContent from "../../assets/tsconfig.bfsp.json?raw";
import {
  CacheGetter,
  fileIO,
  folderIO,
  Loopable,
  parseExtensionAndFormat,
  SharedAsyncIterable,
  SharedFollower,
  toPosixPath,
} from "../toolkit";
import { Debug } from "../logger";
import { registerMulti } from "../multi";
const log = Debug("bfsp:config/#bfsp");

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

const bfspTsconfigFilepath = path.join(
  tmpdir(),
  `tsconfig.bfsp-${createHash("md5").update(bfspTsconfigContent).digest("hex")}.json`
);
if (existsSync(bfspTsconfigFilepath) === false) {
  writeFileSync(bfspTsconfigFilepath, bfspTsconfigContent);
  log("tsconfigUrl", bfspTsconfigFilepath);
}

const _readFromMjs = async (filename: string, refresh?: boolean) => {
  const url = pathToFileURL(filename);
  if (refresh) {
    url.searchParams.append("_", Date.now().toString());
  }
  const { default: config } = await import(url.href);
  return config as Bfsp.UserConfig;
};

export const readUserConfig = async (
  dirname: string,
  options: {
    refresh?: boolean;
  }
) => {
  for (const filename of await folderIO.get(dirname)) {
    if (filename === "#bfsp.ts" || filename === "#bfsp.mts" || filename === "#bfsp.mtsx") {
      const cache_filename = `#bfsp.mjs`;
      const cache_filepath = resolve(dirname, cache_filename);
      try {
        log("complie #bfsp");
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
        return await _readFromMjs(cache_filepath, options.refresh);
      } finally {
        existsSync(cache_filepath) && unlinkSync(cache_filepath);
      }
    }
    // if (filename === "#bfsp.mjs") {
    //   return await _readFromMjs(filename, options.refresh);
    // }
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
    formatExts: parseFormats(userConfig.formats),
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

  /// 监听配置用户的配置文件
  registerMulti(projectDirpath, (cfg) => {
    follower.push(cfg);
  });

  return new SharedAsyncIterable<$BfspUserConfig>(follower);
};
