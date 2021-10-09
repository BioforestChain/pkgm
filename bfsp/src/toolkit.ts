import { readdir, stat, readFile } from "node:fs/promises";
import path from "node:path";
import type {} from "@bfchain/util";
import ignore, { Ignore } from "ignore";

/**
 * 一个通用的基于时间的缓存器
 */
abstract class CacheGetter<K, V> {
  private _cache = new Map<K, { time: number; value: V }>();
  cacheTime = 1e3; // 默认缓存1s
  async get(key: K) {
    let cache = this._cache.get(key);
    const now = Date.now();
    if (cache === undefined || now - cache.time > this.cacheTime) {
      if (cache === undefined) {
        cache = { time: now, value: await this.val(key) };
      }
      this._cache.set(key, cache);
    }
    return cache.value;
  }
  abstract val(key: K): BFChainUtil.PromiseMaybe<V>;
}

/**缓存gitignore的规则 */
type GitIgnore = {
  basedir: string;
  rules: string[];
};
export const gitignoreListCache = new (class GitignoreCache extends CacheGetter<
  string,
  GitIgnore[]
> {
  async val(dir: string) {
    const gitginoreList: GitIgnore[] = [];
    while (true) {
      const names = await readdirCache.get(dir);
      if (names.includes(".gitignore")) {
        const filepath = path.join(dir, ".gitignore");

        if ((await stat(filepath)).isFile()) {
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
        (await stat(path.join(dir, ".git"))).isDirectory()
      ) {
        break;
      }
      dir = path.dirname(dir);
    }
    return gitginoreList;
  }
})();

export const ignoresCache = new (class IgnoreCache extends CacheGetter<
  string,
  (somepath: string) => boolean
> {
  async val(dir: string) {
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
})();

export const isGitIgnored = async (somepath: string) => {
  const ignores = await ignoresCache.get(path.dirname(somepath));
  return ignores(somepath);
};
export const notGitIgnored = async (somepath: string) => {
  const ignores = await ignoresCache.get(path.dirname(somepath));
  return ignores(somepath) === false;
};

const readdirCache = new (class ReaddirCache {
  private _cache = new Map<string, { time: number; names: string[] }>();
  cacheTime = 1e3; // 默认缓存1s
  async get(dirpath: string) {
    let cache = this._cache.get(dirpath);
    const now = Date.now();
    if (cache === undefined || now - cache.time > this.cacheTime) {
      cache = { time: now, names: await readdir(dirpath) };
      this._cache.set(dirpath, cache);
    }
    return cache.names;
  }
  clear(pathbase: string) {
    for (const dirpath of this._cache.keys()) {
      if (dirpath.startsWith(pathbase)) {
        this._cache.delete(dirpath);
      }
    }
  }
})();

export async function* walkFiles(dirpath: string) {
  for (const filename of await readdirCache.get(dirpath)) {
    const filepath = path.resolve(dirpath, filename);
    console.log("walk", filepath);
    if ((await stat(filepath)).isFile()) {
      yield filepath;
    }
  }
}

export async function* AG_Map<T, R>(
  asyncGenerator: AsyncGenerator<T>,
  map: (i: T) => R
) {
  for await (const item of asyncGenerator) {
    console.log("map", item);
    yield (await map(item)) as BFChainUtil.PromiseType<R>;
  }
}

export async function* AG_Filter<T, R = T>(
  asyncGenerator: AsyncGenerator<T>,
  filter: (i: T) => BFChainUtil.PromiseType<boolean>
) {
  for await (const item of asyncGenerator) {
    if (await filter(item)) {
      console.log("filter", item);
      yield item as unknown as R;
    }
  }
}

export async function AG_ToArray<T>(asyncGenerator: AsyncGenerator<T>) {
  const result: T[] = [];
  for await (const item of asyncGenerator) {
    console.log("arr", item);
    result.push(item);
  }
  return result;
}

import "./@types.toolkit";

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
