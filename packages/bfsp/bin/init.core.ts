import { getBfspUserConfig, writeBfspProjectConfig } from "../src";
import { runYarn } from "./yarn/runner";

export const doInit = async (options: { root: string }, logger: PKGM.Logger) => {
  const { root } = options;

  /// 生成配套的配置文件
  logger.info("generate config files");
  await writeBfspProjectConfig({ projectDirpath: root, bfspUserConfig: await getBfspUserConfig(root) }, { logger });

  /// 执行依赖安装
  logger.info("linking dependencies");
  return runYarn({
    root,
    logger,
  }).afterDone;
};
