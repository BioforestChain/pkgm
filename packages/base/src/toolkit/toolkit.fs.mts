/// <reference path="../../typings/index.d.ts"/>
import { existsSync, mkdirSync, statSync } from "node:fs";
import { copyFile, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { ignore } from "../lib/ignore.mjs";

import type {} from "@bfchain/util";
import { require } from "./toolkit.require.mjs";
import { getCircularReplacer } from "./toolkit.util.mjs";

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

export async function writeJsonConfig(filepath: string, config: any) {
  await folderIO.tryInit(path.dirname(filepath));
  // getCircularReplacer解决对象循环引用
  await fileIO.set(filepath, Buffer.from(JSON.stringify(config, getCircularReplacer(), 2)), true);
}

// export const getWorkerDir = () => {
//   return path.join(path.dirname(require.resolve("@bfchain/pkgm-base/package.json")), "build/worker");
// };
