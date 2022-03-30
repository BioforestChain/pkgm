import { defineCommand, linkBFChainPkgmModules, ALLOW_FORMATS, DevLogger, getTui } from "@bfchain/pkgm-bfsp/sdk";
import path from "node:path";

import { WorkspaceConfig } from "../src/configs/workspaceConfig";
import { doDevBfsw, runBfswTsc } from "./dev.core";
import { doInit } from "./init.core";

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

    const TUI = getTui();

    /// 先确保将 pkgm 的包安置好
    linkBFChainPkgmModules(root);

    const workspacePanel = TUI.getPanel("Workspaces");
    const logger = workspacePanel.logger;
    const workspaceConfig = await WorkspaceConfig.WatchFrom(root, logger).workspaceConfigAsync;

    const initLoggerKit = workspacePanel.createLoggerKit({ name: "#init", order: 0 });
    if (
      await doInit(
        { workspaceConfig },
        {
          logger: initLoggerKit.logger,
          yarnLogger: TUI.getPanel("Deps").depsLogger,
        }
      )
    ) {
      // 清除 doInit 留下的日志
      initLoggerKit.destroy();

      // 开始 tsc 编译
      runBfswTsc(workspaceConfig);
      // 开始 bfsw 的开发模式
      await doDevBfsw({ workspaceConfig });
    }
  }
);
