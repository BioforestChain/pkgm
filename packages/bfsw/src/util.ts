import { PromiseOut } from "@bfchain/util-extends-promise-out";
import { setTimeout as sleep } from "node:timers/promises";

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

// (async () => {
//   let i = 0;
//   for await (const taskSignal of ParallelRunner(3)) {
//     console.log("start ", i++);
//     sleep(1000).then(() => {
//       taskSignal.resolve();
//     });
//   }
// })();
