import { walkFiles, notGitIgnored } from "../toolkit";
import type { BfspUserConfig } from "../userConfig";
import path from "node:path";

// import type {} from "typescript";
export const generateTsConfig = async (
  projectDirpath: string,
  config?: BfspUserConfig
) => {
  const tsConfig = {
    compilerOptions: {
      target: "es2020",
      module: "es2020",
      lib: ["ES2020"],
      noEmit: true,
      incremental: true,
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
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
    },
    files: await walkFiles(projectDirpath)
      .filter((filepath) => {
        return (
          (filepath.endsWith(".ts") ||
            filepath.endsWith(".tsx") ||
            filepath.endsWith(".cts") ||
            filepath.endsWith(".mts") ||
            filepath.endsWith(".ctsx") ||
            filepath.endsWith(".mtsx")) &&
          filepath.endsWith("#bfsp.ts") === false &&
          notGitIgnored(filepath) /* promise<boolean> */
        );
      })
      .map((filepath) => path.relative(projectDirpath, filepath))
      .toArray(),
  };
  return tsConfig;
};

export type $TsConfig = BFChainUtil.PromiseReturnType<typeof generateTsConfig>;
import { resolve } from "node:path";
import { fileIO } from "../toolkit";
export const writeTsConfig = (projectDirpath: string, tsConfig: $TsConfig) => {
  return fileIO.set(
    resolve(projectDirpath, "tsconfig.json"),
    Buffer.from(JSON.stringify(tsConfig, null, 2))
  );
};
