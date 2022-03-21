import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { Worker } from "node:worker_threads";
import { getBfspWorkerDir } from "../util";

export interface RunTscOption {
  projectMode?: boolean;
  tsconfigPath: string;
  onMessage: (s: string) => void;
  onClear: () => void;
  onSuccess?: () => void;
  onErrorFound?: (errorCount: number) => void;
  onExit?: () => void;
  watch?: boolean;
}
export const runTsc = (opts: RunTscOption) => {
  let workerMjsPath = path.join(getBfspWorkerDir(), "tsc_worker.mjs");
  if (!existsSync(workerMjsPath)) {
    workerMjsPath = path.join(getBfspWorkerDir(), "../tsc_worker.mjs");
  }
  const tscWorker = new Worker(workerMjsPath, {
    argv: [opts.projectMode ? "-p" : "--build", opts.tsconfigPath, opts.watch ? "-w" : ""].filter(
      Boolean /* 一定要过滤掉空字符串，否则可能会被识别成文件名 */
    ),
    stdin: false,
    stdout: false,
    stderr: false,
    env: {},
  });
  let resolve: Function;
  const ret = Object.assign(new Promise<void>((cb) => (resolve = cb)), {
    stop() {
      tscWorker.terminate();
    },
  });

  tscWorker.on("message", (data) => {
    const cmd = data[0];
    if (cmd === "clearScreen") {
      opts.onClear();
    } else if (cmd === "write") {
      const foundErrors = data[1].match(/Found (\d+) error/);
      if (foundErrors !== null) {
        const errorCount = parseInt(foundErrors[1]);
        if (errorCount === 0) {
          opts.onSuccess && opts.onSuccess();
        } else {
          opts.onErrorFound && opts.onErrorFound(errorCount);
        }
      }
      opts.onMessage(data[1]);
    } else if (cmd === "exit") {
      resolve();
      ret.stop();
    }
  });
  tscWorker.on("exit", () => {
    opts.onExit?.();
  });
  return ret;
};
