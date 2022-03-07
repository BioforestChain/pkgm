import cp from "node:child_process";
import type { Bfsp } from "../bin";

export const doInit = async (options: { root: string }, logger: Bfsp.Bin.ConsoleLogger = console) => {
  const { root } = options;

  logger.info("linking dependencies");

  return new Promise((resolve) => {
    const proc = cp.exec("corepack yarn", { cwd: root });
    if (logger.isSuperLogger) {
      proc.stdout && logger.warn.pipeFrom(proc.stdout);
      proc.stderr && logger.error.pipeFrom(proc.stderr);
    } else {
      proc.stdout?.pipe(process.stdout);
      proc.stderr?.pipe(process.stderr);
    }

    proc.on("exit", (e) => {
      resolve(true);
    });
  });
};
