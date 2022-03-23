import { runYarn } from "@bfchain/pkgm-bfsp";
export const doInit = async (options: { root: string }, logger: PKGM.Logger) => {
  const { root } = options;

  // /// 生成配套的配置文件
  // logger.info("generate config files");
  // await writeBfswProjectConfig(
  //   { projectDirpath: root, bfspUserConfig: await getBfswUserConfig(root) },
  //   { logger, service: getBfswBuildService(watchNoop()) }
  // );

  logger.info("linking dependencies");

  return runYarn({
    root,
    logger,
  }).afterDone;
};
