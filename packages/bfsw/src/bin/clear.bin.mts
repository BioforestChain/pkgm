import path from "node:path";
import { defineCommand } from "@bfchain/pkgm-bfsp/bin.mjs";
import { doClearBfsw } from "./clear.core.mjs";

export const clearCommand = defineCommand(
  "clear",
  {
    params: [],
    args: [[{ type: "string", name: "path", description: "project path for clear, default is cwd." }], []],
    description: "clear projections cache.",
  } as const,
  async (params, args, ctx) => {
    let root = process.cwd();
    let maybeRoot = args[0];
    if (maybeRoot !== undefined) {
      root = path.resolve(root, maybeRoot);
    }

    const logger = ctx.logger;

    /// 开始编译工作
    doClearBfsw({ root }, logger);
  }
);
