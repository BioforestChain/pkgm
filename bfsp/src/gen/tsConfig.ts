import { walkFiles, notGitIgnored } from "../toolkit";
import path from "node:path";

// import type {} from "typescript";
export const generateTsConfig = async (
  projectDirpath: string,
  config?: Bfsp.UserConfig
) => {
  const allTsFiles = await walkFiles(projectDirpath)
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
    .toArray();
  const tsConfig = {
    compilerOptions: {
      composite: true,
      noEmit: true,
      declaration: true,
      sourceMap: false,
      target: "es2020",
      module: "es2020",
      lib: ["ES2020"],
      outDir: "./node_modules/.bfsp/",
      importHelpers: true,
      isolatedModules: true,
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
      baseUrl: "./",
      types: ["node"],
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
    },
    references: [
      {
        path: "./tsconfig.prod.json",
      },
    ],
    files: allTsFiles.filter(
      (file) => !file.endsWith(".type.ts") && !file.startsWith("typings/")
    ),
  };
  const tsProdConfig = {
    extends: "./tsconfig.json",
    compilerOptions: {
      isolatedModules: false,
      outDir: "./node_modules/.bfsp/tsc",
      noEmit: false,
    },
    files: allTsFiles,
    references: [],
  };

  return { tsConfig, tsProdConfig };
};

export type $TsConfig = BFChainUtil.PromiseReturnType<typeof generateTsConfig>;
import { resolve } from "node:path";
import { fileIO } from "../toolkit";
export const writeTsConfig = (projectDirpath: string, config: $TsConfig) => {
  console.log("write to tsconfig")
  return Promise.all([
    fileIO.set(
      resolve(projectDirpath, "tsconfig.json"),
      Buffer.from(JSON.stringify(config.tsConfig, null, 2))
    ),
    fileIO.set(
      resolve(projectDirpath, "tsconfig.prod.json"),
      Buffer.from(JSON.stringify(config.tsProdConfig, null, 2))
    ),
  ]);
};
