import { writeBfspProjectConfig } from "../src/bfspConfig.mjs";
import { getBfspUserConfig } from "../src/configs/bfspUserConfig.mjs";
import { linkBFChainPkgmModules, runYarn } from "./yarn/runner.mjs";

export const doInit = async (args: { root: string }, logger: PKGM.Logger) => {
  const { root } = args;
  
  /// 生成配套的配置文件
  logger.info("generate config files");
  const bfspUserConfig = await getBfspUserConfig(root, { logger });
  await writeBfspProjectConfig({ projectDirpath: root, bfspUserConfig }, { logger });

  /// 执行依赖安装
  logger.info("linking dependencies");
  return runYarn({
    root,
    logger,
    rootPackageNameList: [bfspUserConfig.userConfig.packageJson?.name ?? bfspUserConfig.userConfig.name],
  }).afterDone;
};
