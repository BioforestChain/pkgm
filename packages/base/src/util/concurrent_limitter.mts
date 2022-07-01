import { PromiseOut } from "./extends_promise_out.mjs";

export class ConcurrentTaskLimitter {
  constructor(readonly maxCount = 1) {}
  private _tasks = new Set();
  async genTask() {
    if (this._tasks.size >= this.maxCount) {
      await Promise.any([...this._tasks]);
    }

    const devBfspStarter = new PromiseOut<void>();
    this._tasks.add(devBfspStarter.promise);
    devBfspStarter.onFinished(() => {
      this._tasks.delete(devBfspStarter.promise);
    });
    return devBfspStarter;
  }
}
