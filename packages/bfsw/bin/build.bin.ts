import {
  defineCommand,
  runTsc,
  doBuild,
  DevLogger,
  getTui,
  createTscLogger,
  getBfspUserConfig,
  writeBfspProjectConfig,
} from "@bfchain/pkgm-bfsp/sdk";
import path from "node:path";
import { chalk } from "@bfchain/pkgm-base/lib/chalk";
import { WorkspaceConfig } from "../src/configs/workspaceConfig";
import { doInit } from "./init.core";
import { DepGraph } from "@bfchain/pkgm-base/lib/dep_graph";

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
      // 依赖分析排序
      const projects = dependencyAnalysis(workspaceConfig.projects);

      const buildLogger = getTui().getPanel("Build").logger;
      let i = 0;
      for (const x of projects) {
        workspacePanel.logger.log.pin("progress", ` building ${x.name} [${++i}/${projects.length}]`);
        const projectRoot = path.join(root, x.relativePath);

        const bfspUserConfig = await getBfspUserConfig(projectRoot, { logger: buildLogger });

        // 填充 `extendsService` 內容
        bfspUserConfig.extendsService.tsRefs = workspaceConfig.states.calculateRefsByPath(projectRoot);
        bfspUserConfig.extendsService.dependencies = workspaceConfig.states.calculateDepsByPath(projectRoot);
        const subConfigs = await writeBfspProjectConfig(
          { projectDirpath: projectRoot, bfspUserConfig },
          { logger: buildLogger }
        );
        await doBuild({ root: projectRoot, bfspUserConfig, subConfigs });
        logger.info(`${chalk.green(x.name)} built successfully`);
      }
      workspacePanel.logger.log.pin("progress", `all projects built`);
    }
  }
);

/**
 * 对互相依赖的包进行排序
 * @param projects
 * @returns sortDeps
 */
const dependencyAnalysis = (projects: Bfsw.WorkspaceUserConfig[]) => {
  const graph = new DepGraph();
  for (const project of projects) {
    if (project.deps && project.deps.length !== 0) {
      addGraph(project.deps, project.name);
    }
  }

  const sortDeps: Bfsw.WorkspaceUserConfig[] = [];
  const sortGraph = graph.overallOrder();
  if (sortGraph.length === 0) {
    return projects;
  }
  graph.overallOrder().map((item) => {
    projects.map((project) => {
      if (project.name === item) {
        sortDeps.push(project);
      }
    });
  });

  function addGraph(deps: string[], name: string) {
    graph.addNode(name);
    deps.map((dep) => {
      graph.addNode(dep);
      graph.addDependency(name, dep);
    });
  }

  return sortDeps;
};
