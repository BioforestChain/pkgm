import { PromiseOut } from "@bfchain/util-extends-promise-out";
import ignore from "ignore";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { createRequire } from "node:module";
// const requireRoot = fileURLToPath(new URL("../", import.meta.url).href);
// console.log("requireRoot", requireRoot);
export const require = createRequire(import.meta.url);

export const tryRequireResolve = (require: NodeRequire, nm: string) => {
  try {
    return require.resolve(`@bfchain/pkgm/${nm}`);
  } catch {}
  return require.resolve(nm);
};

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
      setTimeout(doClear, 1e3 + 9e3 * (1 / (Math.sqrt(this._cache.size) + 1)));
    };
    setTimeout(doClear, 1e4);
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
abstract class CacheWritter<K, V> extends CacheGetter<K, V> {
  abstract setVal(key: K, val: V): BFChainUtil.PromiseMaybe<boolean>;
  async set(key: K, val: V, force?: boolean) {
    let cache = this._cache.get(key);
    const now = Date.now();
    if (!force && cache !== undefined && now - cache.time < this.cacheTime && this.isEqual(key, cache.value, val)) {
      return;
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
import { isDeepStrictEqual } from "node:util";
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

export const isGitIgnored = async (somefullpath: string) => {
  const ignores = await ignoresCache.get(path.dirname(somefullpath));
  return ignores(somefullpath);
};
export const notGitIgnored = async (somefullpath: string) => {
  const ignores = await ignoresCache.get(path.dirname(somefullpath));
  return ignores(somefullpath) === false;
};
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
  opts: { dirFilter?: (dirpath: string) => BFChainUtil.PromiseMaybe<boolean>; refreshCache?: boolean } = {}
): AsyncGenerator<string> {
  const { dirFilter = () => true } = opts;
  for (const basename of await folderIO.get(dirpath, opts.refreshCache)) {
    const somepath = path.resolve(dirpath, basename);
    try {
      if (statSync(somepath).isFile()) {
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

export async function* AG_Map<T, R>(asyncGenerator: AsyncGenerator<T>, map: (i: T) => R) {
  for await (const item of asyncGenerator) {
    yield (await map(item)) as BFChainUtil.PromiseType<R>;
  }
}

export async function* AG_Filter<T, R = T>(
  asyncGenerator: AsyncGenerator<T>,
  filter: (i: T) => BFChainUtil.PromiseType<boolean>
) {
  for await (const item of asyncGenerator) {
    if (await filter(item)) {
      yield item as unknown as R;
    }
  }
}

export async function AG_ToArray<T>(asyncGenerator: AsyncGenerator<T>) {
  const result: T[] = [];
  for await (const item of asyncGenerator) {
    result.push(item);
  }
  return result;
}

const AGP = Object.getPrototypeOf(Object.getPrototypeOf((async function* () {})()));
AGP.map = function (map: any) {
  return AG_Map(this, map);
};
AGP.filter = function (filter: any) {
  return AG_Filter(this, filter);
};
AGP.toArray = function () {
  return AG_ToArray(this);
};

AGP.toSharable = function () {
  return new SharedAsyncIterable(this);
};

import { EventEmitter } from "node:events";
EventEmitter.defaultMaxListeners = 100;
export class SharedAsyncIterable<T> implements AsyncIterable<T> {
  private _current?: T;
  constructor(/* private */ source: AsyncIterator<T>) {
    (async () => {
      do {
        const item = await source.next();
        if (item.done) {
          break;
        }
        const { value } = item;
        this._current = value;
        for (const f of this._followers) {
          f.push(value);
        }
        this._ee.emit("value", value);
      } while (this._loop);
      this._loop = true;
    })();
  }
  private _followers = new Set<SharedFollower<T>>();
  private _ee = new EventEmitter();
  onNext(cb: (value: T) => unknown, once?: boolean) {
    if (once) {
      this._ee.once("value", cb);
    } else {
      this._ee.addListener("value", cb);
    }
  }
  hasCurrent() {
    return this._current !== undefined;
  }
  getCurrent() {
    if (this._current === undefined) {
      return this.getNext();
    }
    return this._current;
  }
  getNext() {
    return new Promise<T>((cb) => this.onNext(cb, true));
  }

  private _loop = true;
  stop() {
    if (this._loop) {
      return false;
    }
    this._loop = false;
    return true;
  }

  /// 每一次for await，都会生成一个新的迭代器，直到被break掉
  [Symbol.asyncIterator]() {
    const follower = new SharedFollower<T>(() => {
      this._followers.delete(follower);
    });
    this._followers.add(follower);

    if (this._current !== undefined) {
      follower.push(this._current);
    }
    return follower;
  }
}

export class SharedFollower<T> implements AsyncIterator<T> {
  private _waitters: PromiseOut<T>[] = [];
  private _caches: T[] = [];
  push(item: T) {
    const waitter = this._waitters.shift();
    if (waitter !== undefined) {
      waitter.resolve(item);
    } else {
      this._caches.push(item);
    }
  }
  private _done = false;
  async next() {
    if (this._done) {
      return {
        done: true as const,
        value: undefined,
      };
    }
    let item = this._caches.shift();
    if (item === undefined) {
      const waitter = new PromiseOut<T>();
      this._waitters.push(waitter);
      try {
        item = await waitter.promise;
      } catch {
        return {
          done: true as const,
          value: undefined,
        };
      }
    }
    return {
      done: false as const,
      value: item,
    };
  }

  constructor(private onDone?: Function) {}
  async return() {
    if (this._done === false) {
      this.onDone?.();
      if (this._waitters.length > 0) {
        this._waitters.forEach((waitter) => waitter.reject());
        this._waitters.length = 0;
      }
    }
    return {
      done: (this._done = true as const),
      value: undefined,
    };
  }
  throw() {
    return this.return();
  }
}

//#endregion

export const toPosixPath = (windowsPath: string) => {
  const somepath = windowsPath.replace(/^(\w):|\\+/g, "/$1");
  if (somepath[0] !== "/" && somepath[0] !== ".") {
    return "./" + somepath;
  }
  return somepath;
};

//#region 模糊Array与Set的辅助集合
export abstract class List<T> implements Iterable<T> {
  abstract [Symbol.iterator](): Iterator<T, any, undefined>;
  abstract add(item: T): void;
  abstract remove(item: T): void;
  abstract toArray(): T[];
  abstract toSet(): Set<T>;
  abstract get size(): number;
}
export class ListArray<T> extends List<T> {
  constructor(items?: Iterable<T>) {
    super();
    if (items !== undefined) {
      if (Array.isArray(items)) {
        this._arr = items;
      } else {
        this._arr = [...items];
      }
    } else {
      this._arr = [];
    }
  }
  private _arr: T[];
  add(item: T): void {
    if (this._arr.includes(item) === false) {
      this._arr[this._arr.length] = item;
    }
  }
  remove(item: T): void {
    const index = this._arr.indexOf(item);
    if (index !== -1) {
      this._arr.splice(index, 1);
    }
  }
  get size() {
    return this._arr.length;
  }
  [Symbol.iterator]() {
    return this._arr[Symbol.iterator]();
  }
  toArray() {
    return this._arr;
  }
  toSet() {
    return new Set(this._arr);
  }
}
export class ListSet<T> extends List<T> {
  constructor(items?: Iterable<T>) {
    super();
    this._set = new Set(items);
  }
  private _set: Set<T>;
  add(item: T): void {
    this._set.add(item);
  }
  remove(item: T): void {
    this._set.delete(item);
  }
  get size() {
    return this._set.size;
  }
  [Symbol.iterator]() {
    return this._set[Symbol.iterator]();
  }
  toArray() {
    return [...this._set];
  }
  toSet() {
    return this._set;
  }
}
//#endregion

//#region 一些循环需要用到的辅助
// class SimpleAborter {
//   abortedCallback(reason: unknown) {
//     this.finishedAborted.resolve();
//   }
//   readonly finishedAborted = new PromiseOut<void>();
// }
type DoClose<T> = (reasons: Set<T | undefined>) => unknown;

export const Closeable = <T1 = unknown, T2 = unknown>(
  title: string,
  fun: (reasons: Set<T1 | undefined>) => BFChainUtil.PromiseMaybe<DoClose<T2>>
) => {
  let aborter: DoClose<T2> | undefined;
  let closing = false;
  let starting = false;

  let state: "opening" | "opened" | "closing" | "closed" = "closed";

  type $CMD = "close" | "open";
  class CmdQueue {
    caches = new Set<$CMD>();
    add(cmd: $CMD) {
      this.caches.delete("open");
      this.caches.add(cmd);
    }
    getNext() {
      for (const item of this.caches) {
        this.caches.delete(item);
        return item;
      }
    }
  }
  const cmdQueue = new CmdQueue();

  const looper = Loopable<[1, T1 | undefined] | [2, T2 | undefined] | [3, (T1 & T2) | undefined]>(
    title,
    async (reasons) => {
      do {
        const cmd = cmdQueue.getNext();
        if (cmd === undefined) {
          break;
        }
        if (cmd === "open") {
          if (state === "closed") {
            state = "opening";
            try {
              const openReason = new Set<T1 | undefined>();
              for (const reason of reasons) {
                if (reason && (reason[0] & 1) !== 0) {
                  openReason.add(reason[1] as T1);
                }
              }
              aborter = await fun(openReason);
              state = "opened";
            } catch (err) {
              console.error(`open '${title}' failed`, err);
              state = "closed";
            }
          }
        } else {
          if (state === "opened") {
            state = "closing";
            try {
              const closeReason = new Set<T2 | undefined>();
              for (const reason of reasons) {
                if (reason && (reason[0] & 2) !== 0) {
                  closeReason.add(reason[1] as T2);
                }
              }

              await aborter!(closeReason);
            } catch (err) {
              console.error(`close '${title}' failed`, err);
            }
            aborter = undefined;
            state = "closed";
          }
        }
      } while (true);
    }
  );

  const abortable = {
    start(reason?: T1) {
      cmdQueue.add("open");
      looper.loop([1, reason]);
    },
    close(reason?: T2) {
      cmdQueue.add("close");
      looper.loop([2, reason]);
    },
    restart(reason?: T1 & T2) {
      cmdQueue.add("close");
      cmdQueue.add("open");
      looper.loop([3, reason]);
    },
  };
  return abortable;
};

export const Loopable = <T = unknown>(title: string, fun: (reasons: Set<T | undefined>) => unknown) => {
  let lock: Set<T | undefined> | undefined; //= -1;
  const doLoop = async (reason?: T, debounce?: number) => {
    lock = new Set([reason]);
    if (typeof debounce === "number" && debounce > 0) {
      await sleep(debounce);
    }
    // lock.add(reason);
    do {
      const reasons = lock;
      lock = new Set();
      try {
        await fun(reasons);
      } catch (err) {
        console.error(`error when '${title}' loopping!!`, err);
      }
    } while (lock.size > 0);
    lock = undefined;
  };
  return {
    loop(reason?: T, debounce?: number) {
      if (lock === undefined) {
        doLoop(reason, debounce);
      } else {
        lock.add(reason);
      }
    },
  };
};

//#endregion

//#region 路径相关的辅助函数
export const getExtname = (somepath: string) => {
  return somepath.match(/\.[^\\\/\.]+$/)?.[0] ?? "";
};
export const getSecondExtname = (somepath: string) => {
  return somepath.match(/(\.[^\\\/\.]+)\.[^\\\/\.]+$/)?.[1] ?? "";
};
export const getTwoExtnames = (somepath: string) => {
  const info = somepath.match(/(\.[^\\\/\.]+)(\.[^\\\/\.]+)$/);
  if (info !== null) {
    return {
      ext1: info[2],
      ext2: info[1],
    };
  }
};
export const PathInfoParser = (
  dir: string,
  somepath: string,
  isAbsolute = path.posix.isAbsolute(toPosixPath(somepath))
) => {
  const info = {
    get full() {
      const fullpath = isAbsolute ? somepath : path.join(dir, somepath);
      Object.defineProperty(info, "full", { value: fullpath });
      return fullpath;
    },
    get relative() {
      const relativepath = isAbsolute ? path.relative(dir, somepath) : somepath;
      Object.defineProperty(info, "relative", { value: relativepath });
      return relativepath;
    },
    get extname() {
      const extname = getExtname(somepath);
      Object.defineProperty(info, "extname", { value: extname });
      return extname;
    },
    get secondExtname() {
      const secondExtname = getSecondExtname(somepath);
      Object.defineProperty(info, "secondExtname", { value: secondExtname });
      return secondExtname;
    },
    dir,
  };
  return info;
};
export type $PathInfo = ReturnType<typeof PathInfoParser>;
//#endregion

import type { ModuleFormat } from "rollup";
import { fileURLToPath } from "node:url";
import { sleep } from "@bfchain/util-extends-promise";
const EXTENSION_MAP = {
  es: ".mjs",
  esm: ".mjs",
  module: ".mjs",
  cjs: ".cjs",
  commonjs: ".cjs",
  iife: ".js",
};
export const getExtensionByFormat = (format: ModuleFormat): ".js" | ".mjs" | ".cjs" => {
  return (EXTENSION_MAP as any)[format] || ".js";
};
export const isEqualSet = <T>(set1: Set<T>, set2?: Set<T>) => {
  if (set2 === undefined) {
    return;
  }
  if (set1 === set2) {
    return true;
  }
  if (set1.size !== set2.size) {
    return false;
  }
  for (const item of set1) {
    if (set2.has(item) === false) {
      return false;
    }
  }
  return true;
};
