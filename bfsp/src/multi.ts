import chokidar from "chokidar";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { LogLevel, LoggerOptions } from "vite";
import {
  $BfspUserConfig,
  Closeable,
  Loopable,
  parseExports,
  parseFormats,
  readUserConfig,
  SharedAsyncIterable,
  SharedFollower,
  toPosixPath,
  watchBfspProjectConfig,
  writeBfspProjectConfig,
} from ".";
import { runTsc } from "../bin/tsc/runner";
import { getPkgmVersion, Tree, TreeNode, writeJsonConfig } from "../bin/util";
import { runYarn } from "../bin/yarn/runner";
import { $PackageJson, generatePackageJson } from "./configs/packageJson";
import { $TsConfig, generateTsConfig } from "./configs/tsConfig";
import { consts } from "./consts";
import { createDevTui, Debug } from "./logger";
const debug = Debug("bfsp/multi");

let root: string = process.cwd();

// 用户配置树
const tree = new Tree<string /** path */>(
  {
    compareFn: (a, b) => {
      if (a === b) {
        return 0;
      }
      if (a.startsWith(b)) {
        return 1;
      } else {
        return -1;
      }
    },
    childFn: (a, b) => a.startsWith(b),
    eqFn: (a, b) => a === b,
  },
  "."
);
const nodeMap = new Map<string, TreeNode<string>>();

function _pathToKey(p: string) {
  let relativePath = p;
  if (path.isAbsolute(p)) {
    relativePath = path.relative(root, p);
  }
  if (relativePath === "") {
    relativePath = ".";
  }
  return relativePath;
}
export const treeForEach = async (p: string, cb: (n: TreeNode<string>) => BFChainUtil.PromiseMaybe<void>) => {
  const n = nodeMap.get(_pathToKey(p));
  if (n) {
    await tree.forEach(n, async (x) => cb(x));
  }
};

type WatcherAction = "add" | "change" | "unlink";
interface WatcherEventArgs {
  type: WatcherAction;
  path: string;
  cfg: $BfspUserConfig;
  readonly isRoot: boolean;
}

type WatcherEvent = (e: WatcherEventArgs) => void;

class MultiDevTui {
  private _devTui?: ReturnType<typeof createDevTui>;

  private _getDevTui() {
    if (!this._devTui) {
      this._devTui = createDevTui();
    }
    return this._devTui;
  }
  createTscLogger() {
    return this._getDevTui().createTscLogger();
  }
  createViteLogger(level: LogLevel = "info", options: LoggerOptions = {}) {
    return this._getDevTui().createViteLogger(level, options);
  }
}
export const multiDevTui = new MultiDevTui();
class MultiTsc {
  private _logger?: ReturnType<typeof multiDevTui.createTscLogger>;

  private _getLogger() {
    if (!this._logger) {
      this._logger = multiDevTui.createTscLogger();
    }
    return this._logger;
  }
  private _baseRunTscOpts = () => {
    const logger = this._getLogger();
    return {
      onMessage: (x: string) => {
        // console.log(x);
        logger.write(x);
      },
      onClear: () => logger.clear(),
    };
  };
  tscSucecssCbMap: Map<string, () => void> = new Map();

  dev(opts: { tsConfigPath: string }) {
    return runTsc({
      ...this._baseRunTscOpts(),
      tsconfigPath: opts.tsConfigPath,
      watch: true,
    });
  }
  registerTscSuccess(p: string, cb: () => void) {
    this.tscSucecssCbMap.set(p, cb);
  }
  build(opts: { tsConfigPath: string }) {
    return runTsc({
      ...this._baseRunTscOpts(),
      tsconfigPath: opts.tsConfigPath,
      watch: true,
      onSuccess: () => {
        this.tscSucecssCbMap.forEach((x) => x());
      },
    });
  }
  async buildStage2(opts: { tsConfigPath: string }) {
    return new Promise((resolve) => {
      const logger = this._getLogger();
      runTsc({
        tsconfigPath: opts.tsConfigPath,
        projectMode: true,
        onMessage: (x) => {},
        onClear: () => logger.clear(),
        onExit: () => resolve(null),
      });
    });
  }
}

export const multiTsc = new MultiTsc();

export function initMultiRoot(p: string) {
  root = p;
  const userConfigWatcher = chokidar.watch(
    ["#bfsp.json", "#bfsp.ts", "#bfsp.mts", "#bfsp.mtsx"].map((x) => `./**/${x}`),
    { cwd: root, ignoreInitial: false, ignored: [/node_modules*/, /\.bfsp*/] }
  );
  userConfigWatcher.on("add", async (p) => {
    await multi.handleBfspWatcherEvent(p, "add");
  });
  userConfigWatcher.on("change", async (p) => {
    await multi.handleBfspWatcherEvent(p, "change");
  });
  userConfigWatcher.on("unlink", async (p) => {
    await multi.handleBfspWatcherEvent(p, "unlink");
  });

  const tsWatcher = chokidar.watch(
    ["assets/**/*.json", "**/*.ts", "**/*.tsx", "**/*.cts", "**/*.mts", "**/*.ctsx", "**/*.mtsx"],
    {
      cwd: root,
      ignoreInitial: false,
      followSymlinks: true,
      ignored: [/.*\.d\.ts$/, /\.bfsp*/, /#bfsp\.ts$/, /node_modules*/],
    }
  );

  tsWatcher.on("add", async (p) => {
    await multi.handleTsWatcherEvent(p, "add");
  });
  // tsWatcher.on("change", async (p) => {
  //   await multi.handleTsWatcherEvent(p, "change");
  // });
  tsWatcher.on("unlink", async (p) => {
    await multi.handleTsWatcherEvent(p, "unlink");
  });
}

type $TsPathInfo = {
  [name: string]: string[];
};
type $TsReference = { path: string };

type State = { user: $BfspUserConfig; tsConfig: $TsConfig; packageJson: $PackageJson; path: string };
class States {
  private _pathMap: Map<string, State> = new Map();
  private _nameMap: Map<string, State> = new Map();
  userConfigs() {
    return [...this._pathMap.values()].map((x) => x.user);
  }
  paths() {
    return this._pathMap.keys();
  }
  add(p: string, s: State) {
    this._pathMap.set(p, s);
    this._nameMap.set(s.user.userConfig.name, s);
  }

  findByPath(p: string) {
    return this._pathMap.get(p);
  }
  findByName(n: string) {
    return this._nameMap.get(n);
  }

  delByPath(p: string) {
    const s = this.findByPath(p);
    if (s) {
      this._pathMap.delete(p);
      this._nameMap.delete(s.user.userConfig.name);
    }
  }
  delByName(n: string) {
    const s = this.findByName(n);
    if (s) {
      this._nameMap.delete(n);
      this._pathMap.delete(s.path);
    }
  }
}
export class Multi {
  private _states = new States();
  private _tsWatcherCbMap: Map<string, (p: string, type: WatcherAction) => Promise<void>> = new Map();
  private _userConfigCbMap: Map<string, WatcherEvent> = new Map();
  private _userConfigAllCb = [] as WatcherEvent[];
  private _pendingUserConfigEvents = new Map<string, WatcherEventArgs>();

  constructor() {}
  getStateByPath(p: string) {
    const rp = _pathToKey(p);
    return this._states.findByPath(rp);
  }
  userConfigs() {
    return this._states.userConfigs();
  }
  paths() {
    return this._states.paths();
  }

  async getTsConfigPaths(baseDir: string) {
    const paths: $TsPathInfo = {};
    const r = tree.getRoot()!;
    await tree.forEach(r, (x) => {
      const p1 = path.join(root, x.data);
      let p = path.relative(baseDir, p1);
      const cfg = this._states.findByPath(x.data)?.user;
      if (!cfg) {
        return;
      }

      if (!p.startsWith(".")) {
        p = toPosixPath(p);
      }
      paths[cfg.userConfig.name] = [p];
    });
    return paths;
  }
  async getReferences(baseDir: string) {
    const refSet = new Set<string>();
    // 计算ref
    // 假设当前查询路径是 ./abc/core , 被计算的路径与计算结果对应如下：
    // ./abc/core/module => ./module
    // ./abc/util => ../util
    const addToSet = (x: string | undefined) => {
      if (!x) {
        return;
      }
      const p1 = path.join(root, x);
      const p = path.relative(baseDir, p1);
      if (p === "") {
        return; // 自己不需要包含
      }
      refSet.add(p);
    };
    // 1. 为了tsc编译不漏掉，所有子项目都要加入
    await treeForEach(baseDir, (x) => {
      addToSet(x.data);
    });
    // 2. deps字段里的需要加入
    const k = _pathToKey(baseDir);
    const deps = this._states.findByPath(k)?.user.userConfig.deps;
    if (deps) {
      const pathList = deps.map((x) => this._states.findByName(x)).map((x) => x?.path);
      pathList?.forEach((x) => {
        addToSet(x);
      });
    }
    const refs: $TsReference[] = [...refSet.values()].map((x) => ({ path: path.join(x, "tsconfig.json") }));

    // console.log(`refs for ${baseDir}`, refs);
    return refs;
  }

  async handleBfspWatcherEvent(p: string, type: WatcherAction) {
    debug(type, p);
    const dirname = path.dirname(p);
    const resolvedDir = path.resolve(dirname);
    if (type === "unlink") {
      const target = nodeMap.get(dirname);
      if (!target) {
        return;
      }
      const n = tree.del(target.data);
      const cfg = this._states.findByPath(target.data)!.user;
      const userConfigCb = this._userConfigCbMap.get(target.data);
      const evtArgs = { cfg, isRoot: target.data === ".", type, path: dirname };
      userConfigCb && userConfigCb(evtArgs);
      this._userConfigAllCb.forEach((x) => x(evtArgs));
      this._states.delByPath(target.data);
    } else {
      const c = await readUserConfig(resolvedDir, { refresh: true });
      if (!c) {
        return;
      }
      const userConfig = {
        userConfig: c,
        exportsDetail: parseExports(c.exports),
        formatExts: parseFormats(c.formats),
      } as $BfspUserConfig;
      const tsConfig = await generateTsConfig(resolvedDir, userConfig);
      const packageJson = await generatePackageJson(resolvedDir, userConfig, tsConfig);
      this._states.add(dirname, { user: userConfig, packageJson, tsConfig, path: dirname });
      const userConfigCb = this._userConfigCbMap.get(dirname);
      const evtArgs = { cfg: userConfig, isRoot: dirname === ".", type, path: dirname };
      userConfigCb && userConfigCb(evtArgs);
      this._userConfigAllCb.forEach((x) => x(evtArgs));

      const n = tree.addOrUpdate(dirname);
      nodeMap.set(n.data, n);
    }
  }
  private _getClosestRoot(p: string) {
    const roots = [] as [number /*count of path.sep*/, string /* path */][];
    for (const x of this._states.paths()) {
      const n = path.relative(x, p).split(path.sep).length;
      roots.push([n, x]);
    }
    if (roots.length === 0) {
      return ".";
    }
    roots.sort((a, b) => a[0] - b[0]);
    const closestRoot = roots[0][1];
    return closestRoot;
  }
  async handleTsWatcherEvent(p: string, type: WatcherAction) {
    const closestRoot = this._getClosestRoot(p);
    const tsCb = this._tsWatcherCbMap.get(closestRoot);
    tsCb && (await tsCb(path.relative(closestRoot, p), type));
  }
  isFileBelongs(p: string, file: string) {
    const k = _pathToKey(p);
    const r = this._getClosestRoot(file);
    return k === r;
  }
  registerTsWatcherEvent(p: string, cb: (p: string, type: WatcherAction) => Promise<void>) {
    this._tsWatcherCbMap.set(_pathToKey(p), cb);
  }
  registerUserConfigEvent(p: string, cb: WatcherEvent) {
    const rp = _pathToKey(p);
    this._userConfigCbMap.set(rp, cb);
    const args = this._pendingUserConfigEvents.get(rp);
    args && cb(args);
  }
  registerAllUserConfigEvent(cb: WatcherEvent) {
    this._userConfigAllCb.push(cb);
  }
}
export const multi = new Multi();

export function watchMulti() {
  const follower = new SharedFollower<boolean>();
  const looper = Loopable("watch multi", () => {
    follower.push(true);
  });

  multi.registerAllUserConfigEvent((e) => {
    // if (e.type !== "change") {
    looper.loop("multi changed", 200);
    // }
  });
  return new SharedAsyncIterable<boolean>(follower);
}
export const watchTsc = (p: string) => {
  const follower = new SharedFollower<boolean>();
  const looper = Loopable("watch tsc compilation", () => {
    follower.push(true);
  });

  multiTsc.registerTscSuccess(p, () => looper.loop("tsc success"));
  return new SharedAsyncIterable<boolean>(follower);
};

let rootTsConfigPath: string;
let tscClosable: { stop: () => void };

export function initTsc() {
  // 跑一次就行了，tsc会监听ts以及tsconfig的变化
  rootTsConfigPath = path.join(root, "tsconfig.json");
  tscClosable = multiTsc.build({ tsConfigPath: rootTsConfigPath });
}

export function initWorkspace() {
  multi.registerAllUserConfigEvent(async (e) => {
    if (e.type === "change") {
      return;
    }
    const pkgmVersion = getPkgmVersion();
    const packageJson = {
      name: "bfsp-workspace",
      private: true,
      workspaces: ["./**"],
      devDependencies: {
        "@bfchain/pkgm": `^${pkgmVersion}`,
      },
    };
    await writeJsonConfig(path.join(root, `package.json`), packageJson);
    // await installDeps();
  });
}

export function initTsconfig() {
  multi.registerAllUserConfigEvent(async (e) => {
    if (e.type === "change") {
      return;
    }
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
      references: [...multi.paths()].map((x) => ({ path: path.join(x, `tsconfig.json`) })),
      // files: tsFilesLists.notestFiles.toArray(),
      files: [] as string[],
    };
    await writeJsonConfig(path.join(root, "tsconfig.json"), tsConfig);
  });
}
