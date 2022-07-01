import fs from "node:fs";
import path from "node:path";
import { BFSP_MODE, doClearBfsp } from "@bfchain/pkgm-bfsp/sdk/index.mjs";
import { WorkspaceConfig } from "../main/configs/workspaceConfig.mjs";

export const doClearBfsw = async (options: { root: string }, logger: PKGM.Logger) => {
  const { root } = options;

  const workspaceConfig = await WorkspaceConfig.From({ workspaceDirpath: root, bfspMode: BFSP_MODE.CLEAR }, logger);
  if (workspaceConfig) {
    for (const bfsProject of workspaceConfig.projects) {
      const bfsProjectRoot = path.join(root, bfsProject.relativePath);
      doClearBfsp({ root: bfsProjectRoot }, logger);
    }
  }

  const bfswDir = path.join(root, ".bfsw");
  logger.info("removing .bfsw %s", bfswDir);
  fs.rmSync(bfswDir, { recursive: true });
};
