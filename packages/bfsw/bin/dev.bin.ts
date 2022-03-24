import { chalk } from "@bfchain/pkgm-base/lib/chalk";
import { ALLOW_FORMATS, defineCommand, DevLogger, getTui } from "@bfchain/pkgm-bfsp";
import path from "node:path";
import { WorkspaceConfig } from "../src";
import { doDevBfsw } from "./dev.core";
// import { workspaceInit } from "./workspace";

export const devCommand = defineCommand(
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
        description: "rollup watch quatity limit, default is number of cpu cores substract 1.",
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
    description: "enable bfsw project developmer mode, monitor code modifications in real-time.",
  } as const,
  async (params, args, ctx) => {
    const debug = DevLogger("bfsp:bin/dev");
    let { format } = params;
    if (format !== undefined && ALLOW_FORMATS.has(format as any) === false) {
      debug.warn(`invalid format: '${format}'`);
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

    const logger = getTui().getPanel("Workspaces").logger;
    const workspaceConfig = await WorkspaceConfig.from(root, logger);
    if (workspaceConfig === undefined) {
      ctx.logger.error(`no found workspace config file: '${chalk.blue("#bfsw.ts")}'`);
      return;
    }

    await workspaceConfig.write();

    doDevBfsw({ workspaceConfig });
  }
);
