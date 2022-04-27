import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { ignore } from "@bfchain/pkgm-base/lib/ignore";
import { existsSync, mkdirSync, statSync, readFileSync, rmdirSync, symlinkSync } from "node:fs";
import { copyFile, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import type { ModuleFormat } from "@bfchain/pkgm-base/lib/rollup";
import { PromiseOut } from "@bfchain/pkgm-base/util/extends_promise_out";

import { DevLogger } from "../logger/logger";
import { getCircularReplacer } from "./toolkit.util";

const log = DevLogger("toolkit");

/**
 * 一个通用的基于时间的缓存器
 */
export abstract class CacheGetter<K, V> {
  constructor() {
    const doClear = () => {
      const now = Date.now();
      const minTime = now - this.cacheTime;
      for (const [key, value] of this._cache) {
        if (value.time < minTime) {
          this._cache.delete(key);
        }
      }
      /// 内存清理在10s~1s之间，残留越多，下一次清理的时间越快
      const ti = setTimeout(doClear, 10000); //1e3 + 9e3 * (1 / (Math.sqrt(this._cache.size) + 1)));
      ti.unref();
    };
    doClear();
  }
  protected _cache = new Map<K, { time: number; value: V }>();
  cacheTime = 1e3; // 默认缓存1s
  async get(key: K, refresh?: boolean) {
    let cache = this._cache.get(key);
    const now = Date.now();
    if (refresh || cache === undefined || now - cache.time > this.cacheTime) {
      cache = { time: now, value: await this.getVal(key) };
      this._cache.set(key, cache);
    }
    return cache.value;
  }
  abstract isEqual(key: K, val1: V, val2: V): boolean;
  abstract getVal(key: K): BFChainUtil.PromiseMaybe<V>;

  has(key: K) {
    if (this._cache.has(key)) {
      return true;
    }
    return this.hasVal(key);
  }
  abstract hasVal(key: K): BFChainUtil.PromiseMaybe<boolean>;
}
export abstract class CacheWritter<K, V> extends CacheGetter<K, V> {
  abstract setVal(key: K, val: V): BFChainUtil.PromiseMaybe<boolean>;
  async set(key: K, val: V, force?: boolean) {
    let cache = this._cache.get(key);
    const now = Date.now();
    if (!force) {
      if (
        (cache !== undefined && now - cache.time < this.cacheTime && cache.value !== val) ||
        (this.has(key) && this.isEqual(key, val, await this.get(key)))
      ) {
        log("ignore write file", key);
        return;
      }
      cache = this._cache.get(key)!;
    }
    if (await this.setVal(key, val)) {
      if (cache) {
        cache.value = val;
        cache.time = now;
      } else {
        this._cache.set(key, { time: now, value: val });
      }
    }
  }
  abstract delVal(key: K): BFChainUtil.PromiseMaybe<boolean>;
  async del(key: K) {
    if (await this.delVal(key)) {
      this._cache.delete(key);
    }
  }
}

//#region gitignore 的匹配规则

/**缓存gitignore的规则 */
type GitIgnore = {
  basedir: string;
  rules: string[];
};
class GitignoreCache extends CacheGetter<string, GitIgnore[]> {
  isEqual(key: string, val1: GitIgnore[], val2: GitIgnore[]): boolean {
    return isDeepStrictEqual(val1, val2);
  }
  async getVal(inputDir: string) {
    const gitginoreList: GitIgnore[] = [];
    let dir = inputDir;
    while (true) {
      const names = await folderIO.get(dir);
      if (names.includes(".gitignore")) {
        const filepath = path.join(dir, ".gitignore");

        if (statSync(filepath).isFile()) {
          const gitIgnoreRules: string[] = [];
          for (let line of (await readFile(filepath, "utf-8")).split("\n")) {
            line = line.trim();
            if (line.length > 0 && line[0] !== "#") {
              gitIgnoreRules.push(line);
            }
          }
          if (gitIgnoreRules.length) {
            gitginoreList.push({ basedir: dir, rules: gitIgnoreRules });
          }
        }
      }
      if (names.includes(".git") && statSync(path.join(dir, ".git")).isDirectory()) {
        break;
      }
      const parentDir = path.dirname(dir);
      if (parentDir === dir) {
        break;
      }
      dir = parentDir;
    }
    return gitginoreList;
  }
  has(dir: string) {
    return this.hasVal(dir);
  }
  async hasVal(dir: string) {
    const gitginoreList = await this.get(dir);
    return gitginoreList.length > 0;
  }
}
export const gitignoreListCache = new GitignoreCache();

class IgnoreCache extends CacheGetter<string, (somepath: string) => boolean> {
  isEqual(key: string, val1: (somepath: string) => boolean, val2: (somepath: string) => boolean): boolean {
    return val1 === val2;
  }
  cacheTime = Infinity;

  async getVal(dir: string) {
    const gitginoreList = await gitignoreListCache.get(dir);
    const ignoresList = gitginoreList.map((gitignore) => {
      const ig = ignore();
      ig.add(gitignore.rules);
      return (somepath: string) => ig.ignores(path.relative(gitignore.basedir, somepath));
    });
    return (somepath: string) => ignoresList.some((ignores) => ignores(somepath));
  }
  has(dir: string) {
    return this.hasVal(dir);
  }
  async hasVal(dir: string) {
    return gitignoreListCache.has(dir);
  }
}
export const ignoresCache = new IgnoreCache();

//#endregion

//#region 文件功能的扩展

class ReaddirCache extends CacheGetter<string, string[]> {
  isEqual(key: string, val1: string[], val2: string[]): boolean {
    return isDeepStrictEqual(val1, val2);
  }
  getVal(dirpath: string) {
    return readdir(dirpath);
  }
  clear(pathbase: string) {
    for (const dirpath of this._cache.keys()) {
      if (dirpath.startsWith(pathbase)) {
        this._cache.delete(dirpath);
      }
    }
  }
  hasVal(dirpath: string) {
    return existsSync(dirpath) && statSync(dirpath).isDirectory();
  }
  async tryInit(dirpath: string, options: { recursive?: boolean } = { recursive: true }) {
    if (this.hasVal(dirpath) === false) {
      return mkdirSync(dirpath, options);
    }
  }
}
export const folderIO = new ReaddirCache();

export async function* walkFiles(
  dirpath: string,
  opts: {
    dirFilter?: (dirpath: string) => BFChainUtil.PromiseMaybe<boolean>;
    refreshCache?: boolean;
    skipSymLink?: boolean;
  } = {}
): AsyncGenerator<string> {
  const { dirFilter = () => true, skipSymLink: skipSymbolicLink = false } = opts;
  for (const basename of await folderIO.get(dirpath, opts.refreshCache)) {
    const somepath = path.resolve(dirpath, basename);
    try {
      const stat = statSync(somepath);
      if (stat.isFile()) {
        if (skipSymbolicLink && stat.isSymbolicLink() === true) {
          continue;
        }
        yield somepath;
      } else if (await dirFilter(somepath)) {
        yield* walkFiles(somepath, opts);
      }
    } catch {}
  }
}

class FileIoCache extends CacheWritter<string, Buffer> {
  isEqual(key: string, val1: Buffer, val2: Buffer): boolean {
    return val1.compare(val2) === 0;
  }
  getVal(filepath: string) {
    return readFile(filepath);
  }
  hasVal(filepath: string) {
    return existsSync(filepath);
  }
  async setVal(filepath: string, content: Buffer) {
    await writeFile(filepath, content);
    return true;
  }
  // exits(filepath)
  async delVal(filepath: string) {
    if (existsSync(filepath)) {
      await unlink(filepath);
      return true;
    }
    return false;
  }
}
export const fileIO = new FileIoCache();
//#endregion

const EXTENSION_MAP = {
  es: ".mjs",
  esm: ".mjs",
  module: ".mjs",
  cjs: ".cjs",
  commonjs: ".cjs",
  iife: ".js",
};
export const parseExtensionAndFormat = (format: ModuleFormat | Bfsp.Format) => {
  if (typeof format === "object") {
    return { format: format.format, extension: format.ext };
  }
  return { format: format, extension: ((EXTENSION_MAP as any)[format] || ".js") as Bfsp.JsFormat };
};

/**
 * 批量复制文件（夹）
 * @param src
 * @param dest
 */
export async function cpr(src: string, dest: string) {
  for await (const filepath of walkFiles(src, { refreshCache: true })) {
    const destFilepath = path.join(dest, path.relative(src, filepath));
    await folderIO.tryInit(path.dirname(destFilepath));
    await copyFile(filepath, destFilepath);
  }
}

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

declare module "node:vm" {
  class Module {
    context: any;
    namespace: any;
    identifier: string;
    status: "unlinked" | "linking" | "linked" | "evaluated" | "evaluating" | "errored";
    error?: any;
    evaluate(options?: { timeout?: number; breakOnSigint?: boolean }): Promise<void>;
    link(linker: Linker): Promise<void>;
  }

  type Linker = (specifier: string, referencingModule: Module, extra: {}) => BFChainUtil.PromiseMaybe<Module>;
  class SourceTextModule extends Module {
    constructor(code: string, options: { content: any });
    createCachedData(): Buffer;
  }
}

export const $readFromMjs2 = async <T>(filename: string, logger: PKGM.Logger, refresh?: boolean) => {
  const { SourceTextModule, createContext, Module } = await import("node:vm");

  /// 简单用logger覆盖console
  const customConsole = Object.create(console);
  customConsole.log = logger.log;
  customConsole.info = logger.info;
  customConsole.warn = logger.warn;
  customConsole.error = logger.error;

  const ctx = createContext({
    console: customConsole,
  });
  const script = new SourceTextModule(readFileSync(filename, "utf-8"), { content: ctx });
  await script.link(async (specifier) => {
    const context = await import(specifier);
    const module = new Module();
    module.context = context;
    return module;
    throw new Error(`Unable to resolve dependency: ${specifier}`);
  });
  await script.evaluate();

  const { default: config } = script.namespace;
  return config as T;
};

export const $readFromMjs = async <T>(filename: string, logger: PKGM.Logger, unlink?: boolean) => {
  const url = pathToFileURL(filename);
  url.searchParams.append("_", Date.now().toString());

  try {
    const { default: config } = await import(url.href);
    return config as T;
  } catch (err) {
    logger.error(err);
  } finally {
    if (unlink) {
      // existsSync(filename) && unlinkSync(filename);
    }
  }
};

export const DebounceLoadConfig = <T>(filepath: string, logger: PKGM.TuiLogger, debounce = 50) => {
  // const debounce  = 50
  type LoadConfigTask = {
    status: "debounce" | "loading" | "end";
    task: PromiseOut<T | undefined>;
    fileContent: string;
  };
  const loadConfigTaskList: LoadConfigTask[] = [];
  const loadConfig = async () => {
    const preTask = loadConfigTaskList[loadConfigTaskList.length - 1];
    /// 如果在 debounce 中，说明代码还没执行，同时这个返回值已经被别人接手返回了，所以直接返回空就行
    if (preTask?.status === "debounce") {
      return;
    }

    /// 否则直接创建一个新的任务
    const newTask: LoadConfigTask = {
      status: "debounce",
      task: new PromiseOut(),
      fileContent: "",
    };
    loadConfigTaskList.push(newTask);
    setTimeout(async () => {
      newTask.status = "loading";
      /// 加载脚本内容
      newTask.fileContent = readFileSync(filepath, "utf-8");
      /// 和上一次对比，如果脚本内容一样，那么不需要执行，直接返回空
      if (newTask.fileContent === preTask?.fileContent) {
        newTask.task.resolve(undefined);
        return;
      }

      const newConfig = await $readFromMjs<T>(filepath, logger, true);
      newTask.status = "end";
      newTask.task.resolve(newConfig);
    }, debounce);
    return newTask.task.promise;
  };
  return loadConfig;
};

export async function writeJsonConfig(filepath: string, config: any) {
  await folderIO.tryInit(path.dirname(filepath));
  // getCircularReplacer解决对象循环引用
  await fileIO.set(filepath, Buffer.from(JSON.stringify(config, getCircularReplacer(), 2)), true);
}

export const getBfspDir = () => {
  const importer = import.meta.url;
  const idx = importer.lastIndexOf("@bfchain/pkgm-bfsp");
  let p = "";
  if (idx >= 0) {
    // 全局安装
    const baseNodeModulesDir = fileURLToPath(importer.substring(0, idx));
    p = path.join(baseNodeModulesDir, "@bfchain/pkgm-bfsp"); // yarn global
    if (!existsSync(p)) {
      // npm i -g
      p = baseNodeModulesDir;
    }
  } else {
    // 本地调试
    const lidx = importer.lastIndexOf("/dist/");
    const bfspDir = fileURLToPath(importer.substring(0, lidx));
    p = bfspDir;
  }
  return p;
};

export const getBfswDir = () => {
  const importer = import.meta.url;
  const idx = importer.lastIndexOf("@bfchain/pkgm-bfsw");
  let p = "";
  if (idx >= 0) {
    // 全局安装
    const baseNodeModulesDir = fileURLToPath(importer.substring(0, idx));
    p = path.join(baseNodeModulesDir, "@bfchain/pkgm-bfsw"); // yarn global
    if (!existsSync(p)) {
      // npm i -g
      p = baseNodeModulesDir;
    }
  } else {
    // 本地调试
    const lidx = importer.lastIndexOf("/dist/");
    const bfspDir = fileURLToPath(importer.substring(0, lidx));
    p = bfspDir;
  }
  p = p.replace("bfsp", "bfsw");

  return p;
};
export const getBfspWorkerDir = () => {
  return path.join(getBfspDir(), "dist/main");
};
let bfspPkgJson: any;
export const getBfspPackageJson = () => {
  if (bfspPkgJson === undefined) {
    const p = path.join(getBfspDir(), "package.json");
    bfspPkgJson = new Function(`return ${readFileSync(p, "utf-8")}`)();
  }
  return bfspPkgJson;
};
export const getBfspVersion = () => {
  const version = getBfspPackageJson().version;
  return version as string;
};

export const getBfswPackageJson = () => {
  const p = path.join(getBfswDir(), "package.json");
  return new Function(`return ${readFileSync(p, "utf-8")}`)();
};
export const getBfswVersion = () => {
  return getBfswPackageJson().version;
};

/**
 * 给build创建软连接
 * @param targetSrc
 */
export const createBuildSymLink = (targetSrc: string) => {
  const src = targetSrc.split("build");
  const prefixSrc = src[0];
  if (!prefixSrc) return;
  const nodeModulesSrc = path.join(prefixSrc, "node_modules", path.basename(targetSrc));
  // 如果存在的话先删除创建新的
  if (existsSync(nodeModulesSrc)) {
    rmdirSync(nodeModulesSrc);
  }
  symlinkSync(targetSrc, nodeModulesSrc, "dir");
};
