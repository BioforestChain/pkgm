import { existsSync } from "node:fs";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { getBfspDir, getBfspWorkerDir } from "../util";

export interface RunYarnOption {
  root: string;
  onExit?: () => void;
  onMessage?: (s: string) => void;
}
export const runYarn = (opts: RunYarnOption) => {
  let workerMjsPath = path.join(getBfspWorkerDir(), "yarn_worker.mjs");
  const yarnWorker = new Worker(workerMjsPath);
  let resolve: Function;
  const ret = Object.assign(new Promise<void>((cb) => (resolve = cb)), {
    stop() {
      yarnWorker.terminate();
    },
  });

  yarnWorker.on("message", (data) => {
    if (data.exited !== undefined) {
      resolve();
      ret.stop();
      opts.onExit?.();
    }
    if (data.msg !== undefined) {
      opts.onMessage?.(data.msg);
    }
  });
  yarnWorker.postMessage({ path: opts.root });
  return ret;
};
