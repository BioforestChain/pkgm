import { linkBFChainPkgmModules, runYarn } from "@bfchain/pkgm-bfsp/sdk";
import { WorkspaceConfig } from "../src/configs/workspaceConfig";
import { chalk } from "@bfchain/pkgm-base/lib/chalk";
export const doInit = async (
  root: string,
  options: { logger: PKGM.Logger; yarnLogger?: PKGM.Logger; oneTime?: boolean }
) => {
  const { logger, yarnLogger = logger } = options;

  /// 先确保将 pkgm 的包安置好
  linkBFChainPkgmModules(root);

  const workspaceConfig = await WorkspaceConfig.From(root, options.logger);
  if (workspaceConfig === undefined) {
    options.logger.error(`no found workspace config file: '${chalk.blue("#bfsw.ts")}'`);
    return;
  }

  /// 生成配套的配置文件

  logger.info("generate config files");
  await workspaceConfig.write();

  logger.info("linking dependencies");
  const ret = runYarn({
    root: workspaceConfig.root,
    logger: yarnLogger,
    rootPackageNameList: workspaceConfig.projects.map((p) => p.packageJson?.name ?? p.name),
  }).afterDone;
  if (options.oneTime) {
    workspaceConfig.destroy();
  }
  return ret;
};
