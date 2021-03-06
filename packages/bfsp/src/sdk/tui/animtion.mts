import { setTimeout as sleep } from "node:timers/promises";
import { performance } from "node:perf_hooks";
export type FrameCallback = (time: number) => unknown;
export class AnimationFrameManager {
  private _cb_id_acc = new Uint32Array(1);
  private _funs = new Map<number, FrameCallback>();
  private _looping = false;
  private async _startLoop() {
    if (this._looping) {
      return;
    }
    this._looping = true;
    while (this._funs.size > 0) {
      await sleep(200); // 10fps
      if (this._funs.size === 0) {
        break;
      }
      const now = performance.now();
      const cbs = [...this._funs.values()];
      this._funs.clear();
      for (const cb of cbs) {
        try {
          await cb(now);
        } catch (err) {
          this._emitError(err);
        }
      }

      try {
        await this.requestRender();
      } catch (err) {
        this._emitError(err);
      }
    }
    this._looping = false;
  }
  private _emitError(err: unknown) {
    queueMicrotask(() => {
      process.emit("uncaughtException", err as Error);
    });
  }
  private _nextFrame?: Promise<number>;
  nextFrame() {
    if (this._nextFrame === undefined) {
      this._nextFrame = new Promise<number>((cb) => {
        this.requestAnimationFrame((now) => {
          this._nextFrame = undefined;
          cb(now);
        });
      });
    }
    return this._nextFrame;
  }
  requestAnimationFrame(cb: FrameCallback) {
    const id = this._cb_id_acc[0]++;
    this._funs.set(id, cb);
    this._startLoop();
    return id;
  }
  cancelAnimationFrame(id: number) {
    this._funs.delete(id);
  }
  bindRender(doRender: () => unknown) {
    this._doRender = doRender;
    this.requestRender();
  }
  private _doRender?: () => unknown;
  private _requestingRender = false;
  requestRender() {
    if (this._requestingRender) {
      return;
    }
    this._requestingRender = true;
    queueMicrotask(() => {
      this._requestingRender = false;
      this._doRender?.();
    });
  }
}
export const afm = new AnimationFrameManager();
