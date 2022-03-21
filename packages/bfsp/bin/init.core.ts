import { runYarn } from "./yarn/runner";

export const doInit = async (options: { root: string }, logger: PKGM.Logger) => {
  const { root } = options;

  logger.info("linking dependencies");

  return runYarn({
    root,
    logger,
  }).afterDone;
};
