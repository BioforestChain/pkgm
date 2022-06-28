import { defineCommand } from "../bin.mjs";
import { doInit } from "./init.core.mjs";
import { helpOptions } from "./help.core.mjs";
import path from "node:path";
import { existsSync } from "node:fs";
import { chalk } from "@bfchain/pkgm-base/lib/chalk.mjs";
import { linkBFChainPkgmModules } from "./yarn/runner.mjs";

export const initCommand = defineCommand(
  "init",
  {
    params: [{ type: "string", name: "path", description: "project path, default is cwd()", require: false }],
    args: [],
    description: helpOptions.init,
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

    await doInit({ root }, ctx.logger);
    process.exit(0);
  }
);
