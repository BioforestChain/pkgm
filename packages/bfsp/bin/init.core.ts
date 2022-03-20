import { runYarn } from "./yarn/runner";
import { consoleLogger } from "../src/consoleLogger";

export const doInit = async (options: { root: string }, logger: PKGM.ConsoleLogger = consoleLogger) => {
  const { root } = options;

  logger.info("linking dependencies");

  return runYarn({
    root,
    onMessage: logger.info,
    onError: logger.error,
    onSuccess: logger.success,
    onWarn: logger.warn,
    onFlag: () => {},
  }).afterDone;
};
