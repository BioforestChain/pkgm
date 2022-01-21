import chokidar from "chokidar";
import path from "node:path";
import { readUserConfig, readWorkspaceConfig } from "./configs/bfspUserConfig";
import { Loopable, SharedAsyncIterable, SharedFollower } from "./toolkit";
export type WatcherAction = "add" | "change" | "unlink";

export interface AppWatcher {
  watchTs(root: string, cb: (p: string, type: WatcherAction) => void): BFChainUtil.PromiseMaybe<void>;
  watchUserConfig(root: string, cb: (p: string, type: WatcherAction) => void): BFChainUtil.PromiseMaybe<void>;
}

/// single

export function watchSingle() {
  const watchTs = (root: string, cb: (p: string, type: WatcherAction) => void) => {
    const watcher = chokidar.watch(
      ["assets/**/*.json", "**/*.ts", "**/*.tsx", "**/*.cts", "**/*.mts", "**/*.ctsx", "**/*.mtsx"],
      {
        cwd: root,
        ignoreInitial: false,
        followSymlinks: true,
        ignored: ["*.d.ts", ".bfsp", "#bfsp.ts", "node_modules"],
      }
    );
    watcher.on("add", (p) => cb(p, "add"));
    watcher.on("unlink", (p) => cb(p, "unlink"));
    watcher.on("change", (p) => cb(p, "change"));
  };
  const watchUserConfig = (root: string, cb: (p: string, type: WatcherAction) => void) => {
    const watcher = chokidar.watch(["#bfsp.json", "#bfsp.ts", "#bfsp.mts", "#bfsp.mtsx"], {
      cwd: root,
      ignoreInitial: false,
    });
    watcher.on("add", (p) => cb(p, "add"));
    watcher.on("unlink", (p) => cb(p, "unlink"));
    watcher.on("change", (p) => cb(p, "change"));
  };
  return {
    watchTs,
    watchUserConfig,
  } as AppWatcher;
}
/// workspace

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
}

export interface CbArgsForAllUserConfig {
  cfg: Bfsp.UserConfig;
  type: WatcherAction;
  path: string;
}

let root = "";
const userConfigCbMap: Map<string, ((p: string, type: WatcherAction) => BFChainUtil.PromiseMaybe<void>)[]> = new Map();
const tsCbMap: Map<string, ((p: string, type: WatcherAction) => BFChainUtil.PromiseMaybe<void>)[]> = new Map();
const allUserConfigCbs: ((args: CbArgsForAllUserConfig) => BFChainUtil.PromiseMaybe<void>)[] = [];
const validProjects = new Map<string, Bfsp.WorkspaceUserConfig>();
export const states = new States();

const _pathToKey = (p: string) => {
  let relativePath = p;
  if (path.isAbsolute(p)) {
    relativePath = path.relative(root, p);
  }
  if (relativePath === "") {
    relativePath = ".";
  }
  return relativePath;
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
    workspace.projects.forEach((x) => {
      validProjects.set(x.name, x);
    });
  }
}
async function handleBfswWatcherEvent(p: string, type: WatcherAction) {
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
export function watchWorkspace(options: { root: string }) {
  root = options.root;
  const watchBfsw = () => {
    const watcher = chokidar.watch(
      ["#bfsw.json", "#bfsw.ts", "#bfsw.mts", "#bfsw.mtsx"].map((x) => `./**/${x}`),
      { cwd: root, ignoreInitial: false, ignored: [/node_modules*/, /\.bfsp*/] }
    );
    watcher.on("add", (p) => {
      handleBfswWatcherEvent(p, "add");
    });
    watcher.on("change", (p) => {
      handleBfswWatcherEvent(p, "change");
    });
    watcher.on("unlink", (p) => {
      handleBfswWatcherEvent(p, "unlink");
    });
  };

  const handleBfspWatcherEvent = async (p: string, type: WatcherAction) => {
    await updateWorkspaceConfig(); // 只要bfsp有变动，就更新一下workspace， TODO: 后期优化
    const dirname = path.dirname(p);
    const resolvedDir = path.resolve(dirname);
    const key = _pathToKey(dirname);
    if (type === "unlink") {
      const state = states.findByPath(key);
      states.delByPath(key);
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
    states.add(key, { userConfig: config, path: dirname });

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

  const watchBfsp = () => {
    const watcher = chokidar.watch(
      ["#bfsp.json", "#bfsp.ts", "#bfsp.mts", "#bfsp.mtsx"].map((x) => `./**/${x}`),
      { cwd: root, ignoreInitial: false, ignored: [/node_modules*/, /\.bfsp*/] }
    );
    watcher.on("add", (p) => {
      handleBfspWatcherEvent(p, "add");
    });
    watcher.on("change", (p) => {
      handleBfspWatcherEvent(p, "change");
    });
    watcher.on("unlink", (p) => {
      handleBfspWatcherEvent(p, "unlink");
    });
  };

  const handleTsWatcherEvent = async (p: string, type: WatcherAction) => {
    const closestRoot = _getClosestRoot(p);
    const cbs = tsCbMap.get(closestRoot);
    if (cbs) {
      for (const cb of cbs!) {
        await cb(path.relative(closestRoot, p), type);
      }
    }
  };
  const watchTsFiles = () => {
    const watcher = chokidar.watch(
      ["assets/**/*.json", "**/*.ts", "**/*.tsx", "**/*.cts", "**/*.mts", "**/*.ctsx", "**/*.mtsx"],
      {
        cwd: root,
        ignoreInitial: false,
        followSymlinks: true,
        ignored: [/.*\.d\.ts$/, /\.bfsp*/, /#bfsp\.ts$/, /node_modules*/],
      }
    );

    watcher.on("add", async (p) => {
      await handleTsWatcherEvent(p, "add");
    });
    watcher.on("change", async (p) => {
      await handleTsWatcherEvent(p, "change");
    });
    watcher.on("unlink", async (p) => {
      await handleTsWatcherEvent(p, "unlink");
    });
  };

  watchBfsw();
  watchBfsp();
  watchTsFiles();
  return {
    watchTs(root: string, cb: (p: string, type: WatcherAction) => void): BFChainUtil.PromiseMaybe<void> {
      const key = _pathToKey(root);
      const cbs = tsCbMap.get(key);
      if (cbs) {
        cbs.push(cb);
      } else {
        tsCbMap.set(key, [cb]);
      }
    },
    watchUserConfig(root: string, cb: (p: string, type: WatcherAction) => void): BFChainUtil.PromiseMaybe<void> {
      const key = _pathToKey(root);
      const cbs = userConfigCbMap.get(key);
      if (cbs) {
        cbs.push(cb);
      } else {
        userConfigCbMap.set(key, [cb]);
      }
    },
  } as AppWatcher;
}
