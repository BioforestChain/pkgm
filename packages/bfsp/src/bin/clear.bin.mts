import path from "node:path";
import { defineCommand } from "../bin.mjs";
import { doClearBfsp } from "./clear.core.mjs";
import { helpOptions } from "./help.core.mjs";

export const clearCommand = defineCommand(
  "clear",
  {
    params: [],
    args: [[{ type: "string", name: "path", description: "project path for clear, default is cwd." }], []],
    description: helpOptions.clear,
  } as const,
  async (params, args, ctx) => {
    let root = process.cwd();
    let maybeRoot = args[0];
    if (maybeRoot !== undefined) {
      root = path.resolve(root, maybeRoot);
    }

    const logger = ctx.logger;

    /// 开始编译工作
    await doClearBfsp({ root }, logger);

    process.exit(0);
  }
);
