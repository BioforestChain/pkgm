import { runYarn } from "./yarn/runner";

export const doInit = async (options: { root: string }, consoleLogger: PKGM.ConsoleLogger = console) => {
  const { root } = options;

  consoleLogger.info("linking dependencies");

  let onMessage: undefined | ((s: string) => void);
  let onError: undefined | ((s: string) => void);
  if (consoleLogger.isSuperLogger) {
    const logger = consoleLogger as PKGM.Logger;
    onMessage = (chunk) => {
      const log = chunk.trim();
      if (log.startsWith("success")) {
        logger.success(log);
      } else {
        logger.info(log);
      }
    };
    onError = (chunk) => {
      const log = chunk.trim();
      if (log.startsWith("warning")) {
        logger.warn(log);
      } else {
        logger.error(log);
      }
    };
  }

  return runYarn({
    root,
    onMessage: consoleLogger.info,
    onError: consoleLogger.error,
    onSuccess: consoleLogger.success,
    onWarn: consoleLogger.warn,
    onFlag: () => {},
  }).afterDone;
};
