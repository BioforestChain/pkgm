import {
  getWatcher,
  Loopable,
  readUserConfig,
  SharedAsyncIterable,
  SharedFollower,
  toPosixPath,
} from "@bfchain/pkgm-bfsp";
import path from "node:path";
import { readWorkspaceConfig } from "./workspaceConfig";

type State = { userConfig: Bfsp.UserConfig; path: string };
class States {
  private _pathMap: Map<string, State> = new Map();
  private _nameMap: Map<string, State> = new Map();
  userConfigs() {
    return [...this._pathMap.values()].map((x) => x.userConfig);
  }
  paths() {
    return this._pathMap.keys();
  }
  states() {
    return [...this._nameMap.values()];
  }
  add(p: string, s: State) {
    this._pathMap.set(p, s);
    this._nameMap.set(s.userConfig.name, s);
  }
  clear() {
    this._pathMap.clear();
    this._nameMap.clear();
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
      this._nameMap.delete(s.userConfig.name);
    }
  }
  delByName(n: string) {
    const s = this.findByName(n);
    if (s) {
      this._nameMap.delete(n);
      this._pathMap.delete(s.path);
    }
  }
  async calculateRefsByPath(baseDir: string) {
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

    // deps字段里的需要加入
    const k = _pathToKey(baseDir);
    const deps = this.findByPath(k)?.userConfig.deps;
    if (deps) {
      const pathList = deps.map((x) => this.findByName(x)).map((x) => x?.path);
      pathList?.forEach((x) => {
        addToSet(x);
      });
    }
    const refs = [...refSet.values()].map((x) => ({ path: path.join(x, "tsconfig.json") }));

    // console.log(`refs for ${baseDir}`, refs);
    return refs;
  }
}

export interface CbArgsForAllUserConfig {
  cfg: Bfsp.UserConfig;
  type: Bfsp.WatcherAction;
  path: string;
}
export interface CbArgsForAllTs {
  path: string;
  type: Bfsp.WatcherAction;
  name: string;
}

let root = "";
const userConfigCbMap: Map<string, ((p: string, type: Bfsp.WatcherAction) => BFChainUtil.PromiseMaybe<void>)[]> =
  new Map();
const tsCbMap: Map<string, ((p: string, type: Bfsp.WatcherAction) => BFChainUtil.PromiseMaybe<void>)[]> = new Map();
const allUserConfigCbs: ((args: CbArgsForAllUserConfig) => BFChainUtil.PromiseMaybe<void>)[] = [];
const allTsCbs: ((args: CbArgsForAllTs) => BFChainUtil.PromiseMaybe<void>)[] = [];
const validProjects = new Map<string, Bfsw.WorkspaceUserConfig>();
export const states = new States();

export const getValidProjects = () => {
  return [...validProjects.values()];
};

export const getRoot = () => {
  return root;
};
const _pathToKey = (p: string) => {
  let relativePath = p;
  if (path.isAbsolute(p)) {
    relativePath = path.relative(root, p);
  }
  if (relativePath === "") {
    relativePath = ".";
  }
  return toPosixPath(relativePath);
};

const _getClosestRoot = (p: string) => {
  const roots = [] as [number /*count of path.sep*/, string /* path */][];
  for (const x of states.paths()) {
    const n = path.relative(x, p).split(path.sep).length;
    roots.push([n, x]);
  }
  if (roots.length === 0) {
    return ".";
  }
  roots.sort((a, b) => a[0] - b[0]);
  const closestRoot = roots[0][1];
  return closestRoot;
};
export const isFileBelongs = (p: string, file: string) => {
  const k = _pathToKey(p);
  const r = _getClosestRoot(file);
  return k === r;
};

export function watchMulti() {
  const follower = new SharedFollower<boolean>();
  const looper = Loopable("watch multi", () => {
    follower.push(true);
  });

  registerAllUserConfigEvent((e) => {
    looper.loop("multi changed", 200);
  });
  return new SharedAsyncIterable<boolean>(follower);
}
async function updateWorkspaceConfig() {
  const workspace = await readWorkspaceConfig(root, { refresh: true });
  if (workspace) {
    validProjects.clear();
    states.clear();
    workspace.projects.forEach((x) => {
      validProjects.set(x.name, x);
      states.add(_pathToKey(x.path), { userConfig: x, path: x.path });
    });
  }
}
async function handleBfswWatcherEvent(p: string, type: Bfsp.WatcherAction) {
  const dirname = path.dirname(p);
  if (type === "unlink" && dirname === ".") {
    states.clear();
    return;
  }
  await updateWorkspaceConfig();
}
export function registerAllUserConfigEvent(cb: (args: CbArgsForAllUserConfig) => BFChainUtil.PromiseMaybe<void>) {
  allUserConfigCbs.push(cb);
}
export function registerAllTsEvent(cb: (args: CbArgsForAllTs) => BFChainUtil.PromiseMaybe<void>) {
  allTsCbs.push(cb);
}

const handleBfspWatcherEvent = async (p: string, type: Bfsp.WatcherAction) => {
  await updateWorkspaceConfig(); // 只要bfsp有变动，就更新一下workspace， TODO: 后期优化
  const dirname = path.dirname(p);
  const resolvedDir = path.resolve(dirname);
  const key = _pathToKey(dirname);
  if (type === "unlink") {
    const state = states.findByPath(key);
    // states.delByPath(key);
    for (const cb of allUserConfigCbs) {
      await cb({ cfg: state!.userConfig, type, path: dirname });
    }
    return;
  }
  const config = await readUserConfig(resolvedDir, { refresh: true });
  if (!config) {
    return;
  }
  if (!validProjects.has(config.name)) {
    return;
  }
  // states.add(key, { userConfig: config, path: dirname });

  for (const cb of allUserConfigCbs) {
    await cb({ cfg: config, type, path: dirname });
  }

  const cbs = userConfigCbMap.get(key);
  if (cbs) {
    for (const cb of cbs!) {
      await cb(p, type);
    }
  }
};

const handleTsWatcherEvent = async (p: string, type: Bfsp.WatcherAction) => {
  const closestRoot = _getClosestRoot(p);
  const cbs = tsCbMap.get(closestRoot);
  const state = states.findByPath(closestRoot);
  const _path = path.relative(closestRoot, p);

  allTsCbs.forEach((cb) => {
    cb({ path: _path, type, name: state?.userConfig.name! });
  });

  if (cbs) {
    for (const cb of cbs!) {
      await cb(_path, type);
    }
  }
};

export async function watchWorkspace(options: { root: string }) {
  root = options.root;
  const watcher = await getWatcher(root);

  const watchBfsw = () => {
    watcher.doWatch(
      {
        expression: [
          "allof",
          ["name", ["#bfsw.ts"]],
          ["not", ["match", "**/node_modules/**", "wholename"]],
          ["not", ["match", "**/.*/**", "wholename"]],
        ],
        chokidar: [
          ["#bfsw.ts"].map((x) => `./**/${x}`),
          { cwd: root, ignoreInitial: true, ignored: [/node_modules*/, /\.bfsp*/] },
        ],
      },
      handleBfswWatcherEvent
    );
  };

  const watchBfsp = () => {
    watcher.doWatch(
      {
        expression: [
          "allof",
          ["name", ["#bfsp.ts"]],
          ["not", ["match", "**/node_modules/**", "wholename"]],
          ["not", ["match", "**/.*/**", "wholename"]],
        ],
        chokidar: [
          ["#bfsp.ts"].map((x) => `./**/${x}`),
          { cwd: root, ignoreInitial: false, ignored: [/node_modules*/, /\.bfsp*/] },
        ],
      },
      handleBfspWatcherEvent
    );
  };

  const watchTsFiles = () => {
    watcher.doWatch(
      {
        expression: [
          "allof",
          [
            "anyof",
            ["match", "**/*.ts", "wholename"],
            ["match", "**/*.tsx", "wholename"],
            ["match", "**/*.cts", "wholename"],
            ["match", "**/*.mts", "wholename"],
            ["match", "**/*.ctsx", "wholename"],
            ["match", "**/*.mtsx", "wholename"],
          ],
          ["not", ["match", "**/node_modules/**", "wholename"]],
          ["not", ["match", "build/**", "wholename"]],
          ["not", ["match", "dist/**", "wholename"]],
          ["not", ["match", "**/.*/**", "wholename"]],
        ],
        chokidar: [
          ["assets/**/*.json", "**/*.ts", "**/*.tsx", "**/*.cts", "**/*.mts", "**/*.ctsx", "**/*.mtsx"],
          {
            cwd: root,
            ignoreInitial: false,
            followSymlinks: true,
            ignored: [/.*\.d\.ts$/, /\.bfsp*/, /#bfsp\.ts$/, /node_modules*/],
          },
        ],
      },
      handleTsWatcherEvent
    );
  };

  await updateWorkspaceConfig();
  watchBfsw();
  watchBfsp();
  watchTsFiles();
  return {
    watchTs(root: string, cb: (p: string, type: Bfsp.WatcherAction) => void): BFChainUtil.PromiseMaybe<void> {
      const key = _pathToKey(root);
      const cbs = tsCbMap.get(key);
      if (cbs) {
        cbs.push(cb);
      } else {
        tsCbMap.set(key, [cb]);
      }
    },
    watchUserConfig(root: string, cb: (p: string, type: Bfsp.WatcherAction) => void): BFChainUtil.PromiseMaybe<void> {
      const key = _pathToKey(root);
      const cbs = userConfigCbMap.get(key);
      if (cbs) {
        cbs.push(cb);
      } else {
        userConfigCbMap.set(key, [cb]);
      }
    },
  } as Bfsp.AppWatcher;
}
