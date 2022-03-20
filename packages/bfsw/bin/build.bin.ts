import { DevLogger } from "@bfchain/pkgm-bfsp";
import { defineCommand } from "@bfchain/pkgm-bfsp/bin";
import path from "node:path";
import { workspaceInit } from "./workspace";

export const buildCommand = defineCommand(
  "build",
  {
    params: [
      { type: "string", name: "format", description: "bundle format: esm or cjs, default is esm." },
      { type: "string", name: "profiles", description: "bundle profiles, default is ['default']." },
    ],
    args: [[{ type: "string", name: "path", description: "project path, default is cwd." }], []],
    description: "bundle multiple profiles code.",
  } as const,
  (params, args) => {
    const debug = DevLogger("bfsp:bin/build");

    const profiles = params?.profiles?.split(",") || [];
    if (profiles.length === 0) {
      profiles.push("default");
    }
    console.log(args);
    let root = process.cwd();
    let maybeRoot = args[0];
    if (maybeRoot !== undefined) {
      root = path.resolve(root, maybeRoot);
    }

    workspaceInit({ root, mode: "build" });
  }
);
