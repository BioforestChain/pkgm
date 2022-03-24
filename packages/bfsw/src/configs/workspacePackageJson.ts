import { writeJsonConfig, getBfswVersion } from "@bfchain/pkgm-bfsp";
import path from "node:path";

export class WorkspacePackageJson {
  constructor(private _wc: import("./WorkspaceConfig.base").WorkspaceConfigBase) {}
  async write() {
    const packageJson = {
      name: "bfsp-workspace",
      private: true,
      packageManager: "yarn@1.22.18",
      workspaces: [...this._wc.states.paths()],
      devDependencies: {
        // "@bfchain/pkgm-bfsw": `${bfswVersion}`,
      },
      // dependencies: {
      //   ...buildDeps,
      // },
    };
    await writeJsonConfig(path.join(this._wc.root, `package.json`), packageJson);
  }
}
