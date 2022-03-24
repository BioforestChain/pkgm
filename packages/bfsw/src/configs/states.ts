import path from "node:path";
import { pathToKey } from "../util";

type State = { userConfig: Bfsp.UserConfig; path: string };
export class States {
  constructor(private _wc: import("./WorkspaceConfig.base").WorkspaceConfigBase) {}
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
      const p1 = path.join(this._wc.root, x);
      const p = path.relative(baseDir, p1);
      if (p === "") {
        return; // 自己不需要包含
      }
      refSet.add(p);
    };

    // deps字段里的需要加入
    const key = pathToKey(this._wc.root, baseDir);
    const deps = this.findByPath(key)?.userConfig.deps;
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
