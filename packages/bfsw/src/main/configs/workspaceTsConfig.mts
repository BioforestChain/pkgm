import { writeJsonConfig } from "@bfchain/pkgm-base/toolkit/toolkit.fs.mjs";
import { toPosixPath } from "@bfchain/pkgm-base/toolkit/toolkit.path.mjs";
import path from "node:path";

export class WorkspaceTsConfig {
  constructor(private _wc: import("./WorkspaceConfig.base.mjs").WorkspaceConfigBase) {}
  async write() {
    const tsConfig = {
      references: [...this._wc.states.paths()].flatMap((x) => {
        return [
          {
            path: toPosixPath(path.relative(this._wc.root, path.join(x, `tsconfig.json`))),
          },
        ];
      }),
      // files: tsFilesLists.notestFiles.toArray(),
      include: [],
      files: [],
    };
    await writeJsonConfig(path.join(this._wc.root, "tsconfig.json"), tsConfig);
  }
}
