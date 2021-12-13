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
import { Tree, TreeNode } from "../bin/util";
import { $PackageJson, generatePackageJson } from "./configs/packageJson";
import { $TsConfig, generateTsConfig } from "./configs/tsConfig";
import { consts } from "./consts";
import { createDevTui, Debug, destroyScreen } from "./logger";
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

export const treeForEach = async (p: string, cb: (n: TreeNode<string>) => BFChainUtil.PromiseMaybe<void>) => {
  let relativePath = p;
  if (path.isAbsolute(p)) {
    relativePath = path.relative(root, p);
  }
  if (relativePath === "") {
    relativePath = ".";
  }
  const n = nodeMap.get(relativePath);
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
export class Multi {
  private _stateMap: Map<string, { user: $BfspUserConfig; tsConfig: $TsConfig; packageJson: $PackageJson }> = new Map();
  private _tsWatcherCbMap: Map<string, (p: string, type: WatcherAction) => Promise<void>> = new Map();
  private _userConfigCbMap: Map<string, WatcherEvent> = new Map();
  private _userConfigAllCb = [] as WatcherEvent[];
  private _pendingUserConfigEvents = new Map<string, WatcherEventArgs>();

  constructor() {}
  getState(p: string) {
    const rp = this._pathToKey(p);
    return this._stateMap.get(rp);
  }

  async getPaths(baseDir: string) {
    const paths: $TsPathInfo = {};
    await treeForEach(baseDir, (x) => {
      const p1 = path.join(root, x.data);
      let p = path.relative(baseDir, p1);
      const cfg = this._stateMap.get(x.data)?.user;
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
    const refs: $TsReference[] = [];
    await treeForEach(baseDir, (x) => {
      const p1 = path.join(root, x.data);
      let p = path.relative(baseDir, p1);
      if (p === "") {
        return; // 自己不需要包含
      }
      if (!p.startsWith(".")) {
        p = toPosixPath(path.join(p, "tsconfig.json"));
      }
      refs.push({ path: p });
    });

    return refs;
  }
  private _pathToKey(p: string) {
    let relativePath = p;
    if (path.isAbsolute(p)) {
      relativePath = path.relative(root, p);
    }
    if (relativePath === "") {
      relativePath = ".";
    }
    return relativePath;
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
      const cfg = this._stateMap.get(target.data)!.user;
      const userConfigCb = this._userConfigCbMap.get(target.data);
      const evtArgs = { cfg, isRoot: target.data === ".", type, path: dirname };
      userConfigCb && userConfigCb(evtArgs);
      this._userConfigAllCb.forEach((x) => x(evtArgs));
      this._stateMap.delete(target.data);
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
      this._stateMap.set(dirname, { user: userConfig, packageJson, tsConfig });
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
    for (const x of this._stateMap.keys()) {
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
    const k = this._pathToKey(p);
    const r = this._getClosestRoot(file);
    return k === r;
  }
  registerTsWatcherEvent(p: string, cb: (p: string, type: WatcherAction) => Promise<void>) {
    this._tsWatcherCbMap.set(this._pathToKey(p), cb);
  }
  registerUserConfigEvent(p: string, cb: WatcherEvent) {
    const rp = this._pathToKey(p);
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
    looper.loop("multi changed");
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
  multi.registerAllUserConfigEvent(async (e) => {
    const resolvedDir = path.resolve(e.path);
    if (e.isRoot && !tscClosable) {
      // 跑一次就行了，tsc会监听ts以及tsconfig的变化
      rootTsConfigPath = path.join(resolvedDir, "tsconfig.json");
      tscClosable = multiTsc.build({ tsConfigPath: rootTsConfigPath });
    }
  });
}
