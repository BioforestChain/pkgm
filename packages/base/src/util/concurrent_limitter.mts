import { PromiseOut } from "./extends_promise_out.mjs";

export class ConcurrentTaskLimitter {
  constructor(readonly maxCount = 1) {}
  private _tasks = new Set();
  private _in_queue = 0;
  get size() {
    return this._in_queue + this._tasks.size;
  }
  async genTask() {
    this._in_queue += 1;
    if (this._tasks.size >= this.maxCount) {
      await Promise.any([...this._tasks]);
    }
    this._in_queue -= 1;

    const devBfspStarter = new PromiseOut<void>();
    this._tasks.add(devBfspStarter.promise);
    devBfspStarter.onFinished(() => {
      this._tasks.delete(devBfspStarter.promise);
    });
    return devBfspStarter;
  }
}
