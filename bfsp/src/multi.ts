import chokidar from "chokidar";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  $BfspUserConfig,
  fileIO,
  getBfspUserConfig,
  Loopable,
  parseExports,
  parseFormats,
  readUserConfig,
  SharedAsyncIterable,
  SharedFollower,
} from ".";
import { Tree, TreeNode } from "../bin/util";
import { Debug, destroyScreen } from "./logger";

let root: string = process.cwd();

// 用户配置树
const tree = new Tree<string /** path */>({
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
});
const nodeMap = new Map<string, TreeNode<string>>();

type UserConfigAction = "add" | "change" | "unlink";
interface UserConfigEventArgs {
  type: UserConfigAction;
  path: string;
}

type UserConfigEvent = (e: UserConfigEventArgs) => void;
class MultiUserConfig {
  private _configMap: Map<string, $BfspUserConfig> = new Map();
  private _cbs: UserConfigEvent[] = [];
  private _pathedCbMap: Map<string, UserConfigEvent> = new Map();
  private _pendingEvents = new Map<string, UserConfigEventArgs>();

  async handleWatcherEvent(p: string, type: UserConfigAction) {
    const dirname = path.dirname(p);
    const resolvedDir = path.resolve(dirname);
    const evtArgs = { path: dirname, type };
    if (type === "unlink") {
      const target = nodeMap.get(dirname);
      if (!target) {
        return;
      }
      const n = tree.del(target.data);

      this._cbs.forEach((cb) => cb(evtArgs));
      const cb = this._pathedCbMap.get(resolvedDir);
      cb && cb(evtArgs);

      this._pathedCbMap.delete(resolvedDir);
    } else {
      const cfg = await this.getUserConfig(dirname);
      if (!cfg) {
        return;
      }
      const n = tree.addOrUpdate(dirname);
      nodeMap.set(n.data, n);

      this._cbs.forEach((cb) => cb(evtArgs));
      const cb = this._pathedCbMap.get(resolvedDir);
      if (cb) {
        cb(evtArgs);
      } else {
        this._pendingEvents.set(resolvedDir, evtArgs);
      }
    }
  }

  async getUserConfig(p: string) {
    let relativePath = p;
    if (path.isAbsolute(p)) {
      relativePath = path.relative(root, p);
    }
    if (relativePath === "") {
      relativePath = ".";
    }
    // 不做缓存，因为没有意义
    // let cfg = this._configMap.get(relativePath);
    // if (cfg) {
    //   return cfg;
    // }
    const dir = path.resolve(relativePath);
    const c = await readUserConfig(dir, { refresh: true });
    if (!c) {
      return;
    }
    const cfg = {
      userConfig: c,
      exportsDetail: parseExports(c.exports),
      formatExts: parseFormats(c.formats),
    } as $BfspUserConfig;
    // this._configMap.set(relativePath, cfg);
    return cfg;
  }

  registerAll(cb: UserConfigEvent) {
    this._cbs.push(cb);
  }
  register(path: string, cb: UserConfigEvent) {
    this._pathedCbMap.set(path, cb);
    const args = this._pendingEvents.get(path);
    args && cb(args);
  }
}

export type $TsPathInfo = {
  [name: string]: string[];
};

class MultiTsConfig {
  private async _forEach(p: string, cb: (n: TreeNode<string>) => Promise<void>) {
    let relativePath = p;
    if (path.isAbsolute(p)) {
      relativePath = path.relative(root, p);
    }
    if (relativePath === "") {
      relativePath = ".";
    }
    const n = nodeMap.get(relativePath);
    if (n) {
      await tree.forEach(n, async (x) => await cb(x));
    }
  }
  async getPaths(p: string) {
    const paths: $TsPathInfo = {};
    const sep = path.sep;
    await this._forEach(p, async (x) => {
      let path = x.data;
      const cfg = await multiUserConfig.getUserConfig(path);

      if (!cfg) {
        return;
      }
      if (!path.startsWith(".")) {
        path = `.${sep}${path}`;
      }
      paths[cfg.userConfig.name] = [path];
    });
    return paths;
  }
  async getReferences(p: string) {
    const refs: { path: string }[] = [];
    const sep = path.sep;
    await this._forEach(p, async (x) => {
      let path = x.data;
      const cfg = await multiUserConfig.getUserConfig(path);
      if (!cfg) {
        return;
      }
      if (!path.startsWith(".")) {
        path = `.${sep}${path}`;
      }
      refs.push({ path });
    });

    return refs;
  }
}

export const multiUserConfig = new MultiUserConfig();
export const multiTsConfig = new MultiTsConfig();
export function initMultiRoot(p: string) {
  root = p;
  // setInterval(() => destroyScreen(), 1000);
  // console.log(`看不到面板，请删除这句`);
  const watcher = chokidar.watch(
    ["#bfsp.json", "#bfsp.ts", "#bfsp.mts", "#bfsp.mtsx"].map((x) => `./**/${x}`),
    { cwd: root, ignoreInitial: false }
  );
  watcher.on("add", async (p) => {
    await multiUserConfig.handleWatcherEvent(p, "add");
  });
  watcher.on("change", async (p) => {
    await multiUserConfig.handleWatcherEvent(p, "change");
  });
  watcher.on("unlink", async (p) => {
    await multiUserConfig.handleWatcherEvent(p, "unlink");
  });
}

export function watchMulti() {
  const follower = new SharedFollower<number>();
  let acc = 0;

  /// 监听配置用户的配置文件
  multiUserConfig.registerAll((e) => {
    follower.push(acc++);
  });

  return new SharedAsyncIterable<number>(follower);
}
