import {
  defineCommand,
  runTsc,
  writeBuildConfigs,
  doBuild,
  DevLogger,
  getTui,
  createTscLogger,
} from "@bfchain/pkgm-bfsp/sdk";
import path from "node:path";
import { chalk } from "@bfchain/pkgm-base/lib/chalk";
import { WorkspaceConfig } from "../src/configs/workspaceConfig";
import { doInit } from "./init.core";

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
  async (params, args) => {
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

    const TUI = getTui();

    const workspacePanel = TUI.getPanel("Workspaces");
    const logger = workspacePanel.logger;
    const workspaceConfig = await WorkspaceConfig.From(root, logger);

    const initLoggerKit = workspacePanel.createLoggerKit({ name: "#init", order: 0 });
    if (
      workspaceConfig &&
      (await doInit(
        { workspaceConfig },
        {
          logger: initLoggerKit.logger,
          yarnLogger: TUI.getPanel("Deps").depsLogger,
        }
      ))
    ) {
      // 清除 doInit 留下的日志
      initLoggerKit.destroy();

      const tscCompilation = () => {
        return new Promise((resolve) => {
          const tscLogger = createTscLogger();
          runTsc({
            watch: true,
            tsconfigPath: path.join(root, "tsconfig.json"),
            onMessage: (s) => tscLogger.write(s),
            onClear: () => tscLogger.clear(),
            onSuccess: () => {
              resolve(undefined);
            },
          });
        });
      };
      await tscCompilation();

      const buildLogger = getTui().getPanel("Build").logger;
      workspaceConfig.projects.forEach(async (x) => {
        const projectRoot = path.join(root, x.relativePath);
        const cfgs = await writeBuildConfigs({ root: projectRoot }, { logger: buildLogger });
        await doBuild({ root: projectRoot, cfgs });
        logger.info(`${chalk.green(x.name)} built successfully`);
      });
    }
  }
);
