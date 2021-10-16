import { walkFiles, notGitIgnored, fileIO } from "../toolkit";

export const defaultGitIgnores = new Set([
  ".npm",
  ".vscode",
  ".bfsp",
  ".gitignore",
  "*.tsbuildinfo",
  ".npmignore",
  ".*.ts",
  "typings/dist",
  "typings/dist.d.ts",
  "package.json",
  "tsconfig.isolated.json",
  "tsconfig.typings.json",
  "tsconfig.json",
]);

export const generateGitIgnore = async (projectDirpath: string, config?: Bfsp.UserConfig) => {
  return effectConfigIgnores(defaultGitIgnores, config?.gitignore);
};

export type $GitIgnore = BFChainUtil.PromiseReturnType<typeof generateGitIgnore>;

import { resolve } from "node:path";
import { effectConfigIgnores } from "./commonIgnore";
export const writeGitIgnore = (projectDirpath: string, gitIgnore: $GitIgnore) => {
  return fileIO.set(resolve(projectDirpath, ".gitignore"), Buffer.from([...gitIgnore].join("\n")));
};
