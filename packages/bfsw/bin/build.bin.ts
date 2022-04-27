import {
  defineCommand,
  doBuild,
  DevLogger,
  getTui,
  getBfspUserConfig,
  writeBfspProjectConfig,
} from "@bfchain/pkgm-bfsp/sdk";
import path from "node:path";
import { existsSync, rmdirSync, symlinkSync } from "node:fs";
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

      // 依赖分析排序
      const { projects, sortGraph } = dependencyAnalysis(workspaceConfig.projects);

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
        const buildResults = await doBuild({ root: projectRoot, bfspUserConfig, subConfigs, sortGraph });
        buildResults?.forEach((buildOutDir, name) => {
          createBuildSymLink(root, buildOutDir, name);
        });
        logger.info(`${chalk.green(x.name)} built successfully`);
      }
      workspacePanel.logger.log.pin("progress", `🎉 ${chalk.green("All projects built successfully")}`);
    }
  }
);

/**
 * 给build创建软连接
 * @param targetSrc
 */
export const createBuildSymLink = (root: string, buildOutDir: string, name: string) => {
  const nodeModulesDir = path.resolve(root, "node_modules", name);
  // 如果存在的话先删除创建新的
  if (existsSync(nodeModulesDir)) {
    rmdirSync(nodeModulesDir);
  }
  symlinkSync(buildOutDir, nodeModulesDir, "junction");
};

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
    } else {
      // 就算没有依赖，自身也是个节点
      graph.addNode(project.name);
    }
  }

  const sortDeps: Bfsw.WorkspaceUserConfig[] = [];
  const sortGraph = graph.overallOrder();
  if (sortGraph.length === 0) {
    return { projects, sortGraph };
  }
  // 根据依赖规则排序
  sortGraph.map((item) => {
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

  return { projects: sortDeps, sortGraph };
};
