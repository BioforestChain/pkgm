import { chalk } from "@bfchain/pkgm-base/lib/chalk.mjs";
import { defineCommand, linkBFChainPkgmModules } from "@bfchain/pkgm-bfsp/sdk/index.mjs";
import { existsSync } from "node:fs";
import path from "node:path";
import { WorkspaceConfig } from "../main/configs/workspaceConfig.mjs";
import { doInit } from "./init.core.mjs";

export const initCommand = defineCommand(
  "init",
  {
    params: [{ type: "string", name: "path", description: "project path, default is cwd()", require: false }],
    args: [],
    description: "install dependencies for bfsw project.",
  } as const,
  async (params, args, ctx) => {
    const { path: projectPath } = params;
    let root = process.cwd();

    if (projectPath !== undefined) {
      root = path.resolve(root, projectPath);

      if (!existsSync(root)) {
        throw new Error(chalk.red(`Cannot found directory '${root}'`));
      }
    }

    /// 先确保将 pkgm 的包安置好
    linkBFChainPkgmModules(root);

    const workspaceConfig = await WorkspaceConfig.From(root, ctx.logger);
    if (workspaceConfig === undefined) {
      ctx.logger.error(`no found workspace config file: '${chalk.blue("#bfsw.ts")}'`);
      return;
    }

    await doInit({ workspaceConfig }, ctx);
    process.exit(0);
  }
);
