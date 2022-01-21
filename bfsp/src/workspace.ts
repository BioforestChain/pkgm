import chokidar from "chokidar";
import { existsSync } from "node:fs";
import path from "node:path";
import { Closeable, notGitIgnored, readUserConfig, readWorkspaceConfig, walkFiles } from ".";
import { workspaceItemDoDev } from "../bin/multi/dev.core";
import { runTsc } from "../bin/tsc/runner";
import { getPkgmVersion, Tasks, writeJsonConfig } from "../bin/util";
import { BuildService, getBfswBuildService } from "./core";
import { watchWorkspace, states, registerAllUserConfigEvent, CbArgsForAllUserConfig } from "./watcher";
import { DepGraph } from "dependency-graph";
import { createTscLogger } from "./logger";
import { getTui } from "./tui";

let root = "";
let appWatcher: ReturnType<typeof watchWorkspace>;
let bfswBuildService: BuildService | undefined;
let runningTasks: Map<string, ReturnType<typeof Closeable>> = new Map();
const pendingTasks = new Tasks<string>();
const dg = new DepGraph();

async function updateWorkspaceTsConfig() {
  const tsConfig = {
    compilerOptions: {
      composite: true,
      noEmit: true,
      declaration: true,
      sourceMap: false,
      target: "es2020",
      module: "es2020",
      lib: ["ES2020"],
      importHelpers: true,
      isolatedModules: false,
      strict: true,
      noImplicitAny: true,
      strictNullChecks: true,
      strictFunctionTypes: true,
      strictBindCallApply: true,
      strictPropertyInitialization: true,
      noImplicitThis: true,
      alwaysStrict: true,
      moduleResolution: "node",
      resolveJsonModule: true,
      // baseUrl: "./",
      // types: ["node"],
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
    },
    references: [...states.paths()].map((x) => ({ path: path.join(x, `tsconfig.json`) })),
    // files: tsFilesLists.notestFiles.toArray(),
    files: [] as string[],
  };
  await writeJsonConfig(path.join(root, "tsconfig.json"), tsConfig);
}
async function updatePackageJson() {
  const pkgmVersion = getPkgmVersion();

  const packageJson = {
    name: "bfsp-workspace",
    private: true,
    workspaces: [...states.paths()],
    devDependencies: {
      "@bfchain/pkgm": `^${pkgmVersion}`,
    },
  };
  await writeJsonConfig(path.join(root, `package.json`), packageJson);
}

async function handleBfspWatcherEvent(args: CbArgsForAllUserConfig) {
  const { type, cfg } = args;
  if (type === "unlink") {
    dg.removeNode(cfg.name);
  }
  dg.addNode(cfg.name);
  cfg.deps?.map((x) => {
    dg.addNode(x);
    dg.addDependency(cfg.name, x);
  });
  if (type !== "change") {
    // 新增删除都需要更新根tsconfig.json
    await updateWorkspaceTsConfig();
  }
  await updatePackageJson();
  if (!runningTasks.has(cfg.name)) {
    pendingTasks.add(cfg.name);
  }
}
function runRootTsc() {
  const tsconfigPath = path.join(root, "tsconfig.json");
  if (!existsSync(tsconfigPath)) {
    setTimeout(() => runRootTsc(), 1000);
  } else {
    const logger = createTscLogger();
    runTsc({
      tsconfigPath,
      watch: true,
      onSuccess: () => {},
      onClear: () => logger.clear(),
      onMessage: (s) => logger.write(s),
    });
  }
}
export async function workspaceInit(options: { root: string; mode: "dev" | "build" }) {
  root = options.root;
  registerAllUserConfigEvent(handleBfspWatcherEvent);
  runRootTsc();
  appWatcher = watchWorkspace({ root });
  bfswBuildService = getBfswBuildService(appWatcher);
  runTasks(options.mode);
  // TODO: 多项目模式下的依赖管理，考虑拦截deps流之后在这里做依赖安装
}
const { status } = getTui();
async function runTasks(mode: "dev" | "build") {
  const name = pendingTasks.next();
  if (name) {
    const state = states.findByName(name);
    if (state) {
      const resolvedDir = path.join(root, state.path);
      if (mode === "dev") {
        // TODO: 任务串行化(包括 rollup watcher 任务问题)
        status.postMsg(`compiling ${name}`);
        const closable = await workspaceItemDoDev({ root: resolvedDir, buildService: bfswBuildService! });
        runningTasks.set(state.userConfig.name, closable);
        status.postMsg(`${name} compilation finished`);
      } else {
        // TODO: build task
      }
    }
  }
  setTimeout(async () => {
    await runTasks(mode);
  }, 1000);
}
