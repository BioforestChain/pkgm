import { EventEmitter } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";
import { PromiseOut } from "@bfchain/pkgm-base/util/extends_promise_out.mjs";
import "@bfchain/pkgm-base/util/typings.mjs";

import { DevLogger } from "../logger/logger.mjs";

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

EventEmitter.defaultMaxListeners = 100;
export class SharedAsyncIterable<T> implements AsyncIterable<T> {
  private _current?: T;
  get current() {
    return this._current;
  }
  constructor(/* private */ source: AsyncIterator<T> | SharedFollower<T>) {
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
    return this._bind("value", cb, once);
  }
  hasCurrent() {
    return this._current !== undefined;
  }
  waitCurrent() {
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
    if (this._loop === false) {
      return false;
    }
    this._loop = false;
    this._ee.emit("stop");
    return true;
  }
  onStop(cb: () => void, once?: boolean) {
    /// 根据当前的状态立即执行
    if (this._loop === false) {
      cb();
    }
    return this._bind("stop", cb, once);
  }
  private _bind(eventname: string, cb: (...args: any[]) => void, once?: boolean) {
    if (once) {
      this._ee.once(eventname, cb);
    } else {
      this._ee.on(eventname, cb);
    }
    return () => this._ee.off(eventname, cb);
  }

  /// 每一次for await，都会生成一个新的迭代器，直到被break掉
  [Symbol.asyncIterator]() {
    return this.toAI();
  }
  toSAI() {
    const follower = new SharedFollower<T>(() => {
      this._followers.delete(follower);
    });
    this._followers.add(follower);

    if (this._current !== undefined) {
      follower.push(this._current);
    }
    return follower as AsyncIterableIterator<T>;
  }
  toAI() {
    return this.toSAI() as AsyncIterableIterator<T>;
  }
}

export class SharedFollower<T> implements AsyncIterableIterator<T> {
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

  constructor(private _onDone?: Function) {}
  async return() {
    if (this._done === false) {
      this._onDone?.();
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
  private _yielded = false;
  [Symbol.asyncIterator](): AsyncIterableIterator<T> {
    if (this._yielded) {
      throw new Error("shared flowser should not be iterator multi times!");
    }
    this._yielded = true;
    return this as AsyncIterableIterator<T>;
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
  fun: (reasons: Set<T1 | undefined>) => BFChainUtil.PromiseMaybe<DoClose<T2>>,
  defaultDebounce?: number
) => {
  const debug = DevLogger("bfsp:toolkit/closeable/" + title);
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
  const enum LOOP_CTRL_CMD {
    START = 1,
    STOP = 2,
    RESTART = 3,
  }

  const looper = Loopable<
    | [LOOP_CTRL_CMD.START, T1 | undefined]
    | [LOOP_CTRL_CMD.STOP, T2 | undefined]
    | [LOOP_CTRL_CMD.RESTART, (T1 & T2) | undefined]
  >(title, async (reasons) => {
    do {
      const cmd = cmdQueue.getNext();
      if (cmd === undefined) {
        break;
      }
      debug("cmd", cmd, state);
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
      } else if (cmd === "close") {
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
      } else {
        throw new Error(`unknonw cmd: ${cmd}`);
      }
    } while (true);
  });

  const abortable = {
    start(reason?: T1, debounce = defaultDebounce) {
      cmdQueue.add("open");
      looper.loop([LOOP_CTRL_CMD.START, reason], debounce);
    },
    close(reason?: T2, debounce = defaultDebounce) {
      cmdQueue.add("close");
      looper.loop([LOOP_CTRL_CMD.STOP, reason], debounce);
    },
    restart(reason?: T1 & T2, debounce = defaultDebounce) {
      cmdQueue.add("close");
      cmdQueue.add("open");
      looper.loop([LOOP_CTRL_CMD.RESTART, reason], debounce);
    },
    /* @todo 
    pause
    remuse
    */
  };
  return abortable;
};

export const Loopable = <T extends unknown = unknown>(
  title: string,
  fun: (reasons: Set<T | undefined>) => unknown,
  defaultDebounce?: number
) => {
  let lock: Set<T | undefined> | undefined; //= -1;
  const doLoop = async (reason?: T, debounce?: number) => {
    lock = new Set([reason]);
    // lock.add(reason);
    do {
      if (typeof debounce === "number" && debounce > 0) {
        await sleep(debounce);
      }
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
    loop(reason?: T, debounce = defaultDebounce) {
      if (lock === undefined) {
        doLoop(reason, debounce);
      } else {
        lock.add(reason);
      }
    },
  };
};

//#endregion
