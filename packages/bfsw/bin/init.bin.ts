import { chalk } from "@bfchain/pkgm-base/lib/chalk";
import { defineCommand } from "@bfchain/pkgm-bfsp/sdk";
import { existsSync } from "node:fs";
import path from "node:path";
import { WorkspaceConfig } from "../src/configs/workspaceConfig";
import { doInit } from "./init.core";

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

    await doInit(root, ctx);
    process.exit(0);
  }
);
