import type {} from "@bfchain/util";
import ignore from "ignore";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * 一个通用的基于时间的缓存器
 */
abstract class CacheGetter<K, V> {
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
      setTimeout(doClear, 1e3 + 9e3 * (1 / (Math.sqrt(this._cache.size) + 1)));
    };
    setTimeout(doClear, 1e4);
  }
  protected _cache = new Map<K, { time: number; value: V }>();
  cacheTime = 1e3; // 默认缓存1s
  async get(key: K) {
    let cache = this._cache.get(key);
    const now = Date.now();
    if (cache === undefined || now - cache.time > this.cacheTime) {
      if (cache === undefined) {
        cache = { time: now, value: await this.getVal(key) };
      }
      this._cache.set(key, cache);
    }
    return cache.value;
  }
  abstract getVal(key: K): BFChainUtil.PromiseMaybe<V>;

  has(key: K) {
    if (this._cache.has(key)) {
      return true;
    }
    return this.hasVal(key);
  }
  abstract hasVal(key: K): BFChainUtil.PromiseMaybe<boolean>;
}
abstract class CacheWritter<K, V> extends CacheGetter<K, V> {
  abstract setVal(key: K, val: V): BFChainUtil.PromiseMaybe<boolean>;
  async set(key: K, val: V) {
    if (await this.setVal(key, val)) {
      let cache = this._cache.get(key);
      const now = Date.now();
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
  async getVal(dir: string) {
    const gitginoreList: GitIgnore[] = [];
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
      if (
        names.includes(".git") &&
        statSync(path.join(dir, ".git")).isDirectory()
      ) {
        break;
      }
      dir = path.dirname(dir);
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
  async getVal(dir: string) {
    const gitginoreList = await gitignoreListCache.get(dir);
    const ignoresList = gitginoreList.map((gitignore) => {
      const ig = ignore();
      ig.add(gitignore.rules);
      return (somepath: string) =>
        ig.ignores(path.relative(gitignore.basedir, somepath));
    });
    return (somepath: string) =>
      ignoresList.some((ignores) => ignores(somepath));
  }
  has(dir: string) {
    return this.hasVal(dir);
  }
  async hasVal(dir: string) {
    return gitignoreListCache.has(dir);
  }
}
export const ignoresCache = new IgnoreCache();

export const isGitIgnored = async (somepath: string) => {
  const ignores = await ignoresCache.get(path.dirname(somepath));
  return ignores(somepath);
};
export const notGitIgnored = async (somepath: string) => {
  const ignores = await ignoresCache.get(path.dirname(somepath));
  return ignores(somepath) === false;
};
//#endregion

//#region 文件功能的扩展

class ReaddirCache extends CacheGetter<string, string[]> {
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
  async tryInit(dirpath: string) {
    if (this.hasVal(dirpath) === false) {
      return mkdirSync(dirpath);
    }
  }
}
export const folderIO = new ReaddirCache();

export async function* walkFiles(
  dirpath: string,
  dirFilter: (dirpath: string) => BFChainUtil.PromiseMaybe<boolean> = () => true
): AsyncGenerator<string> {
  for (const basename of await folderIO.get(dirpath)) {
    const somepath = path.resolve(dirpath, basename);
    // console.log("walk", somepath);
    if (statSync(somepath).isFile()) {
      yield somepath;
    } else if (await dirFilter(somepath)) {
      yield* walkFiles(somepath);
    }
  }
}

class FileIoCache extends CacheWritter<string, Buffer> {
  getVal(filepath: string) {
    return readFile(filepath);
  }
  hasVal(filepath: string) {
    return existsSync(filepath);
  }
  async setVal(filepath: string, content: Buffer) {
    // mkdir(path.dirname(filepath))
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

//#region 扩展AsyncGenerator的原型链

export async function* AG_Map<T, R>(
  asyncGenerator: AsyncGenerator<T>,
  map: (i: T) => R
) {
  for await (const item of asyncGenerator) {
    // console.log("map", item);
    yield (await map(item)) as BFChainUtil.PromiseType<R>;
  }
}

export async function* AG_Filter<T, R = T>(
  asyncGenerator: AsyncGenerator<T>,
  filter: (i: T) => BFChainUtil.PromiseType<boolean>
) {
  for await (const item of asyncGenerator) {
    if (await filter(item)) {
      // console.log("filter", item);
      yield item as unknown as R;
    }
  }
}

export async function AG_ToArray<T>(asyncGenerator: AsyncGenerator<T>) {
  const result: T[] = [];
  for await (const item of asyncGenerator) {
    // console.log("arr", item);
    result.push(item);
  }
  return result;
}

const AGP = Object.getPrototypeOf(
  Object.getPrototypeOf((async function* () {})())
);
AGP.map = function (map: any) {
  return AG_Map(this, map);
};
AGP.filter = function (filter: any) {
  return AG_Filter(this, filter);
};
AGP.toArray = function () {
  return AG_ToArray(this);
};
//#endregion

export const toPosixPath = (windowsPath: string) =>
  windowsPath.replace(/^(\w):|\\+/g, "/$1");
