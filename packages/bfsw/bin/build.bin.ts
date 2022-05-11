import {
  defineCommand,
  doBuild,
  DevLogger,
  getTui,
  getBfspUserConfig,
  writeBfspProjectConfig,
  linkBFChainPkgmModules,
} from "@bfchain/pkgm-bfsp/sdk";
import path from "node:path";
import { existsSync, rmdirSync, symlinkSync } from "node:fs";
import { chalk } from "@bfchain/pkgm-base/lib/chalk";
import { PromiseOut } from "@bfchain/pkgm-base/util/extends_promise_out";
import { WorkspaceConfig } from "../src/configs/workspaceConfig";
import { doInit } from "./init.core";
import { DepGraph } from "@bfchain/pkgm-base/lib/dep_graph";
import { WorkspacesPanel } from "@bfchain/pkgm-bfsp/sdk/tui/internalPanels";

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
  const { sortDeps: projects, sortGraph: currentTasks } = dependencyAnalysis(graph, workspaceConfig!.projects, true);
  const buildLogger = getTui().getPanel("Build").logger;

  await projectBundlePromiseTasks(root, projects, currentTasks, workspaceConfig!, graph);
};

const projectBundlePromiseTasks = async (
  root: string,
  projects: Bfsw.WorkspaceUserConfig[],
  currentTasks: string[],
  workspaceConfig: WorkspaceConfig,
  graph: InstanceType<typeof DepGraph>
) => {
  if (currentTasks.length > 0) {
    const tasks: Promise<Map<string, string> | undefined>[] = [];
    const buildLogger = getTui().getPanel("Build").logger;

    for (const x of projects) {
      tasks.push(projectBundlePromise(root, x, workspaceConfig, buildLogger));
    }

    try {
      await Promise.all(tasks);

      const { sortDeps, sortGraph } = getNoDependencyProjects(graph, currentTasks, workspaceConfig.projects);

      await projectBundlePromiseTasks(root, sortDeps, sortGraph, workspaceConfig!, graph);
    } catch {
      return;
    }
  } else {
    const buildLogger = getTui().getPanel("Build").logger;
    buildLogger.info("all projects finished!!!");
    return;
  }
};

const projectBundlePromise = async (
  root: string,
  project: Bfsw.WorkspaceUserConfig,
  workspaceConfig: WorkspaceConfig,
  buildLogger: PKGM.Logger
) => {
  let po = new PromiseOut<Map<string, string> | undefined>();
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
    po.resolve(undefined);
    return po.promise;
  }
  buildResults.forEach((buildOutDir, name) => {
    createBuildSymLink(root, buildOutDir, name);
  });

  po.resolve(buildResults);
  return po.promise;
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
    workspacePanel.logger.log.pin("progress", ` building ${x.name} [${++i}/${projects.length}]`);
    const projectRoot = path.join(root, x.relativePath);

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
      break;
    }
    buildResults.forEach((buildOutDir, name) => {
      createBuildSymLink(root, buildOutDir, name);
    });
    logger.info(`${chalk.green(x.name)} built successfully`);
  }
  if (i === projects.length) {
    workspacePanel.logger.log.pin("progress", `🎉 ${chalk.green("All projects built successfully")}`);
  }
};

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

/**
 * 完成一批次的依赖bundle之后，获取下一批次的无依赖项目
 * @param graph
 * @param finishedDependencies
 * @param projects
 * @returns
 */
const getNoDependencyProjects = (
  graph: InstanceType<typeof DepGraph>,
  finishedDependencies: string[],
  projects: Bfsw.WorkspaceUserConfig[]
) => {
  if (finishedDependencies.length === 0) {
    return { sortDeps: [], sortGraph: [] };
  }

  for (const depsName of finishedDependencies) {
    graph.removeNode(depsName);
  }

  const sortDeps: Bfsw.WorkspaceUserConfig[] = [];
  const sortGraph = graph.overallOrder(true);

  sortGraph.map((item) => {
    projects.map((project) => {
      if (project.name === item) {
        sortDeps.push(project);
      }
    });
  });

  return { sortDeps, sortGraph };
};
