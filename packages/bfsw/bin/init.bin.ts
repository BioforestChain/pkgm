import { defineCommand } from "@bfchain/pkgm-bfsp/bin";
import { doInit } from "./init.core";
import path from "node:path";
import { existsSync } from "node:fs";
import chalk from "chalk";

defineCommand(
  "init",
  {
    params: [{ type: "string", name: "path", description: "project path, default is cwd()", require: false }],
    args: [],
  } as const,
  async (params, args) => {
    const { path: projectPath } = params;
    let root = process.cwd();

    if (projectPath !== undefined) {
      root = path.resolve(root, projectPath);

      if(!existsSync(root)) {
        throw new Error(chalk.red(`Cannot found directory '${root}'`));
      }
    }

    await doInit({ root });
    process.exit(0);
  }
);
