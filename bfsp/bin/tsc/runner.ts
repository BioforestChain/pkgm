import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

export interface RunTscOption {
  tsconfigPath: string;
  onMessage: (s: string) => void;
  onClear: () => void;
  onSuccess?: () => void;
  onExit?: () => void;
  watch?: boolean;
}
export const runTsc = (opts: RunTscOption) => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const workerMjsPath = path.join(__dirname, "./tsc_worker.mjs");
  const tscWorker = new Worker(workerMjsPath, {
    argv: ["--build", opts.tsconfigPath, opts.watch ? "-w" : ""],
    stdin: false,
    stdout: false,
    stderr: false,
  });
  const ret = {
    stop() {
      tscWorker.terminate();
    },
  };

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
        }
      }
      opts.onMessage(data[1]);
    } else if (cmd === "exit") {
      opts.onExit && opts.onExit();
    }
  });
  return ret;
};
