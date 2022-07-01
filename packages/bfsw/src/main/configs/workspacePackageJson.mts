import { writeJsonConfig } from "@bfchain/pkgm-base/toolkit/toolkit.fs.mjs";
import { toPosixPath } from "@bfchain/pkgm-base/toolkit/toolkit.path.mjs";
import path from "node:path";

export class WorkspacePackageJson {
  constructor(private _wc: import("./WorkspaceConfig.base.mjs").WorkspaceConfigBase) {}
  async write() {
    const packageJson = {
      name: "bfsp-workspace",
      private: true,
      packageManager: "yarn@1.22.18",
      workspaces: [...this._wc.states.paths()].map((projectRoot) =>
        toPosixPath(path.relative(this._wc.root, projectRoot))
      ),
    };
    await writeJsonConfig(path.join(this._wc.root, `package.json`), packageJson);
  }
}
