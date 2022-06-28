import {
  defineCommand,
  doBuild,
  DevLogger,
  getTui,
  getBfspUserConfig,
  writeBfspProjectConfig,
  linkBFChainPkgmModules,
} from "@bfchain/pkgm-bfsp/sdk/index.mjs";
import path from "node:path";
import { existsSync, symlinkSync, unlinkSync } from "node:fs";
import { chalk } from "@bfchain/pkgm-base/lib/chalk.mjs";
import { ParallelPool } from "@bfchain/pkgm-base/util/extends_promise.mjs";
import { WorkspaceConfig } from "../main/configs/workspaceConfig.mjs";
import { doInit } from "./init.core.mjs";
import { DepGraph } from "@bfchain/pkgm-base/lib/dep_graph.mjs";
import { WorkspacesPanel } from "@bfchain/pkgm-bfsp/sdk/tui/internalPanels.mjs";

export const buildCommand = defineCommand(
  "build",
  {
    params: [
      { type: "string", name: "format", description: "bundle format: esm or cjs, default is esm." },
      { type: "string", name: "profiles", description: "bundle profiles, default is ['default']." },
      { type: "boolean", name: "parallel", description: "bundle multiple projects in parallel." },
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
    /// 先确保将 pkgm 的包安置好
    linkBFChainPkgmModules(root);

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
    }

    if (params.parallel) {
      await sequanceBundleParallel({ root, workspaceConfig, workspacePanel });
    } else {
      await sequanceBundleOneByOne({ root, workspaceConfig, workspacePanel });
    }
  }
);

export const sequanceBundleParallel = async (options: {
  root: string;
  workspaceConfig: WorkspaceConfig | undefined;
  workspacePanel: WorkspacesPanel;
}) => {
  const { root, workspaceConfig, workspacePanel } = options;
  const logger = workspacePanel.logger;
  const graph = new DepGraph({ circular: true });
  const { sortGraph: currentGraph } = dependencyAnalysis(graph, workspaceConfig!.projects, true);
  const buildLogger = getTui().getPanel("Build").logger;

  const pp = new ParallelPool<string | void>();
  await projectsBundleParallel({
    root,
    currentGraph,
    workspaceConfig: workspaceConfig!,
    graph,
    logger,
    buildLogger,
    pp,
  });
};

const projectsBundleParallel = async (options: {
  root: string;
  currentGraph: string[];
  workspaceConfig: WorkspaceConfig;
  graph: InstanceType<typeof DepGraph>;
  logger: PKGM.TuiLogger;
  buildLogger: PKGM.Logger;
  pp: ParallelPool;
}) => {
  const { root, currentGraph, workspaceConfig, graph, logger, buildLogger, pp } = options;

  if (currentGraph.length > 0) {
    workspaceConfig.projects.map(async (project) => {
      if (currentGraph.includes(project.name)) {
        pp.addTaskExecutor(async () => {
          logger.log.pin(`${project.name}`, ` building ${project.name}`);
          return await projectBuild({ root, project, workspaceConfig, buildLogger });
        });
      }
    });

    pp.maxParallelNum = currentGraph.length;
    for await (const v of pp.yieldResults()) {
      if (v !== undefined) {
        logger.log.pin(`${v}`, `${chalk.green(v)} built successfully`);
        graph.removeNode(v);
      }

      if (pp.isDone) {
        pp.maxParallelNum = 0;
      }
    }

    const sortGraph: string[] = graph.overallOrder(true);

    await projectsBundleParallel({ root, currentGraph: sortGraph, workspaceConfig, graph, logger, buildLogger, pp });
  } else {
    logger.log.pin("progress", `🎉 ${chalk.green("All projects built successfully")}`);
  }
};

export const sequanceBundleOneByOne = async (options: {
  root: string;
  workspaceConfig: WorkspaceConfig | undefined;
  workspacePanel: WorkspacesPanel;
}) => {
  const { root, workspaceConfig, workspacePanel } = options;
  const logger = workspacePanel.logger;

  // 依赖分析排序
  const graph = new DepGraph({ circular: true });
  const { sortDeps: projects } = dependencyAnalysis(graph, workspaceConfig!.projects);

  const buildLogger = getTui().getPanel("Build").logger;
  let i = 0;
  for (const x of projects) {
    logger.log.pin("progress", ` building ${x.name} [${++i}/${projects.length}]`);

    await projectBuild({ root, project: x, workspaceConfig: workspaceConfig!, buildLogger });

    logger.info(`${chalk.green(x.name)} built successfully`);
  }
  if (i === projects.length) {
    workspacePanel.logger.log.pin("progress", `🎉 ${chalk.green("All projects built successfully")}`);
  }
};

export const projectBuild = async (options: {
  root: string;
  project: Bfsw.WorkspaceUserConfig;
  workspaceConfig: WorkspaceConfig;
  buildLogger: PKGM.Logger;
}) => {
  const { root, project, workspaceConfig, buildLogger } = options;

  const projectRoot = path.join(root, project.relativePath);

  const bfspUserConfig = await getBfspUserConfig(projectRoot, { logger: buildLogger });

  // 填充 `extendsService` 內容
  bfspUserConfig.extendsService.tsRefs = workspaceConfig!.states.calculateRefsByPath(projectRoot);
  bfspUserConfig.extendsService.dependencies = workspaceConfig!.states.calculateDepsByPath(projectRoot);
  const subConfigs = await writeBfspProjectConfig(
    { projectDirpath: projectRoot, bfspUserConfig },
    { logger: buildLogger }
  );
  const buildResults = await doBuild({ root: projectRoot, bfspUserConfig, subConfigs });
  if (!buildResults) {
    return;
  }
  buildResults.forEach((buildOutDir, name) => {
    createBuildSymLink(root, buildOutDir, name);
  });

  return project.name;
};

/**
 * 给build创建软连接
 * @param targetSrc
 */
export const createBuildSymLink = (root: string, buildOutDir: string, name: string) => {
  const nodeModulesDir = path.resolve(root, "node_modules", name);
  // 如果存在的话先删除创建新的
  if (existsSync(nodeModulesDir)) {
    unlinkSync(nodeModulesDir);
  }
  symlinkSync(buildOutDir, nodeModulesDir, "junction");
};

/**
 * 对互相依赖的包进行排序
 * @param projects
 * @returns sortDeps
 */
const dependencyAnalysis = (
  graph: InstanceType<typeof DepGraph>,
  projects: Bfsw.WorkspaceUserConfig[],
  leavesOnly: boolean = false
) => {
  for (const project of projects) {
    if (project.deps && project.deps.length !== 0) {
      addGraph(project.deps, project.name);
    } else {
      // 就算没有依赖，自身也是个节点
      graph.addNode(project.name);
    }
  }

  const sortDeps: Bfsw.WorkspaceUserConfig[] = [];
  const sortGraph = graph.overallOrder(leavesOnly);
  if (sortGraph.length === 0) {
    return { sortDeps: projects, sortGraph: [] };
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

  for (const project of sortGraph) {
    graph.removeNode(project);
  }

  return { sortDeps, sortGraph };
};
