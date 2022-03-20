import { getYarnPath } from "@bfchain/pkgm-base/lib/yarn";
import cp from "node:child_process";
export const doInit = async (options: { root: string }, consoleLogger: PKGM.ConsoleLogger) => {
  const { root } = options;
  consoleLogger.info("linking dependencies");
  const yarnPath = await getYarnPath();
  return new Promise((resolve) => {
    const proc = cp.spawn("node", [yarnPath], { cwd: root });

    if (consoleLogger.isSuperLogger) {
      const logger = consoleLogger as PKGM.Logger;
      proc.stdout.on("data", (chunk) => {
        const log = String(chunk).trim();
        if (log.startsWith("success")) {
          logger.success(log);
        } else {
          logger.info(log);
        }
      });
    } else {
      proc.stdout?.pipe(process.stdout);
      proc.stderr?.pipe(process.stderr);
    }

    proc.on("exit", (e) => {
      resolve(true);
    });
  });
};
