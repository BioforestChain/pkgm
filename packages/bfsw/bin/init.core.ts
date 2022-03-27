import { runYarn } from "@bfchain/pkgm-bfsp";
import { WorkspaceConfig } from "../src/configs/workspaceConfig";
export const doInit = async (
  args: { workspaceConfig: WorkspaceConfig },
  options: { logger: PKGM.Logger; yarnLogger?: PKGM.Logger }
) => {
  const { workspaceConfig } = args;
  const { logger, yarnLogger = logger } = options;

  /// 生成配套的配置文件

  logger.info("generate config files");
  await workspaceConfig.write();

  logger.info("linking dependencies");
  return runYarn({
    root: workspaceConfig.root,
    logger: yarnLogger,
    rootPackageNameList: workspaceConfig.projects.map((p) => p.packageJson?.name ?? p.name),
  }).afterDone;
};
