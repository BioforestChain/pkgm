import { defineCommand } from "@bfchain/pkgm-bfsp/bin";
import path from "node:path";
import { workspaceInit } from "./workspace";

export const npmCommand = defineCommand(
  "npm",
  {
    params: [
      { type: "string", name: "format", description: "bundle format: esm or cjs, default is esm." },
      { type: "string", name: "profiles", description: "bundle profiles, default is ['default']." },
    ],
    args: [[{ type: "string", name: "path", description: "project path, default is cwd." }], []],
    description: "bundle multiple profiles code for npm publish.",
  } as const,
  async (params, args) => {
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

    await workspaceInit({ root, mode: "npm" });
  }
);
