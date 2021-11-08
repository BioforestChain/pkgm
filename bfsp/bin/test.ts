import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
export const doTest = async (options: {
  root?: string;
  tests?: string[];
  logger?: { outWrite: (str: string) => void; errWrite: (str: string) => void };
  debug?: boolean;
}) => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const { logger } = options;
  const pipeStdIo = logger !== undefined;

  const avaWorker = new Worker(path.join(__dirname, "./ava_worker.mjs"), {
    argv: [],
    workerData: {
      root: options.root || process.cwd(),
      debug: options.debug,
    },
    stdin: pipeStdIo,
    stdout: pipeStdIo,
    stderr: pipeStdIo,
  });
  if (pipeStdIo) {
    avaWorker.stdout.on("data", (data) => {
      logger.outWrite(data);
    });
    avaWorker.stderr.on("data", (data) => {
      logger.errWrite(data);
    });
  }
  //   avaWorker.
};
