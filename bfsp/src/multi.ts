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
import { Tree } from "../bin/util";
import { Debug, destroyScreen } from "./logger";
const pathedConfigCbMap = new Map<string, { lastConfig?: Bfsp.UserConfig; cb: (cfg: $BfspUserConfig) => void }>();
const unemitedCfg = new Map<string, $BfspUserConfig>();
const log = Debug("bfsp:multi");
const configCbs = [] as ((p: string, cfg: $BfspUserConfig) => void)[];
interface NodeData {
  path: string;
  cfg: Bfsp.UserConfig;
}
// 用户配置树
const tree = new Tree<NodeData>({
  compareFn: (x, y) => {
    const a = x.path;
    const b = y.path;
    if (a === b) {
      return 0;
    }
    if (a.startsWith(b)) {
      return 1;
    } else {
      return -1;
    }
  },
  childFn: (a, b) => a.path.startsWith(b.path),
  eqFn: (a, b) => a.path === b.path,
});

export function initMulti(root: string, cbConfig: (p: string, cfg: $BfspUserConfig) => void) {
  configCbs.push(cbConfig);
  // setInterval(() => destroyScreen(), 1000);
  // console.log(`看不到面板，请删除这句`);
  const watcher = chokidar.watch(
    ["#bfsp.json", "#bfsp.ts", "#bfsp.mts", "#bfsp.mtsx"].map((x) => `./**/${x}`),
    { cwd: root, ignoreInitial: false }
  );

  const emitNewConfig = async (p: string, event: "add" | "change") => {
    const dir = path.resolve(path.dirname(p));
    try {
      const c = await readUserConfig(dir, { refresh: true });
      if (!c) {
        return;
      }
      tree.addOrUpdate({ path: path.dirname(p), cfg: c });
      // console.log(tree.getRoot());
      const cfg = {
        userConfig: c,
        exportsDetail: parseExports(c.exports),
        formatExts: parseFormats(c.formats),
      } as $BfspUserConfig;
      configCbs.forEach((cb) => cb(p, cfg));
      const state = pathedConfigCbMap.get(dir);
      if (state) {
        if (state.lastConfig) {
          if (isDeepStrictEqual(state.lastConfig, cfg.userConfig)) {
            return;
          }
        }
        state.cb(cfg);
        state.lastConfig = cfg.userConfig;
      } else {
        unemitedCfg.set(dir, cfg);
      }
    } catch (e) {
      // console.log(e);
    }
  };
  watcher.on("add", async (p) => {
    await emitNewConfig(p, "add");
  });
  watcher.on("change", async (p) => {
    await emitNewConfig(p, "change");
  });
}
export function registerMulti(path: string, cb: (cfg: $BfspUserConfig) => void) {
  pathedConfigCbMap.set(path, { cb });
  if (unemitedCfg.has(path)) {
    cb(unemitedCfg.get(path)!);
  }
}

export type $TsPathInfo = {
  [name: string]: string[];
};
export function watchTsPathInfo() {
  const follower = new SharedFollower<$TsPathInfo>();
  let previousTsPaths: $TsPathInfo;
  const looper = Loopable("watch pathinfo", async (reasons) => {
    const paths: $TsPathInfo = {};
    tree.forEach((x) => {
      let path = x.data.path;
      if (!path.startsWith(".")) {
        path = `./${path}`;
      }
      paths[x.data.cfg.name] = [path];
    });
    if (!previousTsPaths || !isDeepStrictEqual(previousTsPaths, paths)) {
      follower.push(paths);
      previousTsPaths = paths;
    }
  });
  configCbs.push((p, cfg) => looper.loop("pathinfo changed"));
  looper.loop("init", 200);
  return new SharedAsyncIterable<$TsPathInfo>(follower);
}
