import { toPosixPath } from "@bfchain/pkgm-base/toolkit/toolkit.path.mjs";
import path from "node:path";

type State = { userConfig: Bfsp.UserConfig; projectRoot: string };
export class States {
  constructor(private _wc: import("./WorkspaceConfig.base.mjs").WorkspaceConfigBase) {}
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
  add(projectRoot: string, state: State) {
    this._pathMap.set(projectRoot, state);
    this._nameMap.set(state.userConfig.name, state);
  }
  clear() {
    this._pathMap.clear();
    this._nameMap.clear();
  }

  findByPath(projectRoot: string) {
    return this._pathMap.get(projectRoot);
  }
  findByName(projectName: string) {
    return this._nameMap.get(projectName);
  }

  delByPath(projectRoot: string) {
    const s = this.findByPath(projectRoot);
    if (s) {
      this._pathMap.delete(projectRoot);
      this._nameMap.delete(s.userConfig.name);
    }
  }
  delByName(projectName: string) {
    const s = this.findByName(projectName);
    if (s) {
      this._nameMap.delete(projectName);
      this._pathMap.delete(s.projectRoot);
    }
  }
  calculateRefsByPath(projectRoot: string) {
    const references: Bfsp.TsReference[] = [];

    /**去重 */
    const relativePaths = new Set<string>();

    for (const projectName of this.findByPath(projectRoot)?.userConfig.deps ?? []) {
      const state = this.findByName(projectName);
      if (state !== undefined) {
        const relativePath = path.relative(projectRoot, state.projectRoot);
        if (relativePath === "") {
          // 自己不需要包含
          continue;
        }
        relativePaths.add(relativePath);
      }
    }

    // 加入依赖的项目
    for (const relativePath of relativePaths) {
      references.push({
        path: toPosixPath(path.join(relativePath, "tsconfig.json")),
      });
    }
    return references;
  }
  calculateDepsByPath(projectRoot: string) {
    const deps: Bfsp.Dependencies = {};
    for (const projectName of this.findByPath(projectRoot)?.userConfig.deps ?? []) {
      const state = this.findByName(projectName);
      if (state !== undefined) {
        deps[projectName] = `^${state.userConfig.packageJson?.version || "1.0.0"}`;
      }
    }
    return deps;
  }
}
