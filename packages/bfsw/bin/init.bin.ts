import { defineCommand } from "@bfchain/pkgm-bfsp/bin";
import { doInit } from "./init.core";
import path from "node:path";

defineCommand(
  "init",
  {
    params: [{ type: "string", name: "path", description: "project path, default is cwd()", require: false }],
    args: [[{ type: "string", name: "path", description: "project path" }], []],
  } as const,
  async (params, args) => {
    const { path: projectPath = args[0] || "." } = params;

    let root = process.cwd();

    if (projectPath !== undefined) {
      root = path.resolve(root, projectPath);
    }

    await doInit({ root });
    process.exit(0);
  }
);
