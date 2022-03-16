import { PromiseOut } from "@bfchain/pkgm-base/util/extends_promise_out";

export async function* ParallelRunner(max: number) {
  let waitter: PromiseOut<void> | undefined; // = new PromiseOut
  let remain = max;
  while (true) {
    for (; remain > 0; remain--) {
      const task = new PromiseOut<void>();
      task.onFinished(() => {
        remain++;
        if (waitter !== undefined) {
          waitter.resolve();
          waitter = undefined;
        }
      });
      yield task;
    }
    waitter = new PromiseOut();
    await waitter.promise;
  }
}
