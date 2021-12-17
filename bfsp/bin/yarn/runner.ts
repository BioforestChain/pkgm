import { existsSync } from "node:fs";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

export interface RunYarnOption {
  root: string;
  onExit?: () => void;
  onMessage?: (s: string) => void;
}
export const runYarn = (opts: RunYarnOption) => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  let workerMjsPath = path.join(__dirname, "./yarn_worker.mjs");
  if (!existsSync(workerMjsPath)) {
    workerMjsPath = path.join(__dirname, "../yarn_worker.mjs");
  }
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
