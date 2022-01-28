import path from "node:path";
import { defineCommand } from "@bfchain/pkgm-bfsp/bin";
import { ALLOW_FORMATS } from "@bfchain/pkgm-bfsp";
import { Debug, Warn } from "@bfchain/pkgm-bfsp";
import { workspaceInit } from "./workspace";

defineCommand(
  "dev",
  {
    params: [
      {
        type: "string",
        name: "format",
        description: "bundle format: esm or cjs, default is esm.",
      },
      {
        type: "string",
        name: "profiles",
        description: "bundle profiles, default is ['default'].",
      },
      {
        type: "number",
        name: "limit",
        description:
          "rollup watch quatity limit, default is number of cpu cores substract 1.",
      },
    ],
    args: [
      [
        {
          type: "string",
          name: "path",
          description: "project path, default is cwd.",
        },
      ],
      [],
    ],
  } as const,
  (params, args) => {
    const warn = Warn("bfsp:bin/dev");
    const log = Debug("bfsp:bin/dev");
    let { format } = params;
    if (format !== undefined && ALLOW_FORMATS.has(format as any) === false) {
      warn(`invalid format: '${format}'`);
      format = undefined;
    }

    const profiles = params?.profiles?.split(",") || [];
    if (profiles.length === 0) {
      profiles.push("default");
    }

    let root = process.cwd();
    let maybeRoot = args[0];
    if (maybeRoot !== undefined) {
      root = path.resolve(root, maybeRoot);
    }

    workspaceInit({ root, mode: "dev", watcherLimit: params?.limit });
  }
);
