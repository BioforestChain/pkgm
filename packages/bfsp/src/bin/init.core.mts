import { BFSP_MODE, getBfspProjectConfig, writeBfspProjectConfig } from "../main/bfspConfig.mjs";
import { runYarn } from "./yarn/runner.mjs";

export const doInit = async (args: { root: string }, logger: PKGM.Logger) => {
  const { root } = args;

  /// 生成配套的配置文件
  logger.info("generate config files");
  const bfspProjectConfig = await getBfspProjectConfig(root, BFSP_MODE.INIT, { logger });
  await writeBfspProjectConfig(bfspProjectConfig, { logger });

  /// 执行依赖安装
  logger.info("linking dependencies");
  return runYarn({
    root,
    logger,
    rootPackageNameList: [
      bfspProjectConfig.user.userConfig.packageJson?.name ?? bfspProjectConfig.user.userConfig.name,
    ],
  }).afterDone;
};
