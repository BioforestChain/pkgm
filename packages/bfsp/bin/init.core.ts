import cp from "node:child_process";
import { getYarnPath } from "../src";

export const doInit = async (options: { root: string }, logger: PKGM.ConsoleLogger = console) => {
  const { root } = options;

  logger.info("linking dependencies");
  const yarnPath = await getYarnPath();

  return new Promise((resolve) => {
    const proc = cp.spawn("node", [yarnPath], { cwd: root });
    if (logger.isSuperLogger) {
      proc.stdout && logger.warn.pipeFrom!(proc.stdout);
      proc.stderr && logger.error.pipeFrom!(proc.stderr);
    } else {
      proc.stdout?.pipe(process.stdout);
      proc.stderr?.pipe(process.stderr);
    }

    proc.on("exit", (e) => {
      resolve(true);
    });
  });
};
