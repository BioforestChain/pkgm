import { writeJsonConfig } from "@bfchain/pkgm-bfsp";
import path from "node:path";

export class WorkspaceTsConfig {
  constructor(private _wc: import("./workspaceConfig").WorkspaceConfig) {}
  async write() {
    const tsConfig = {
      compilerOptions: {
        composite: true,
        noEmit: true,
        declaration: true,
        sourceMap: false,
        target: "es2020",
        module: "es2020",
        lib: ["ES2020"],
        importHelpers: true,
        isolatedModules: false,
        strict: true,
        noImplicitAny: true,
        strictNullChecks: true,
        strictFunctionTypes: true,
        strictBindCallApply: true,
        strictPropertyInitialization: true,
        noImplicitThis: true,
        alwaysStrict: true,
        moduleResolution: "node",
        resolveJsonModule: true,
        // baseUrl: "./",
        // types: ["node"],
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
      },
      references: [...this._wc.states.paths()].flatMap((x) => {
        return [
          {
            path: path.join(x, `tsconfig.isolated.json`),
          },
        ];
      }),
      // files: tsFilesLists.notestFiles.toArray(),
      files: [],
    };
    await writeJsonConfig(path.join(this._wc.root, "tsconfig.json"), tsConfig);
  }
}
