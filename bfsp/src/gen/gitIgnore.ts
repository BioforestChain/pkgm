import { walkFiles, notGitIgnored, fileIO } from "../toolkit";
import type { BfspUserConfig } from "../userConfig";
export const generateGitIgnore = async (
  projectDirpath: string,
  config?: BfspUserConfig
) => {
  return [
    ".npm",
    ".vscode",
    ".gitignore",
    "package.json",
    "tsconfig.json",
    "vite.config.ts",
  ];
};

export type $GitIgnore = BFChainUtil.PromiseReturnType<
  typeof generateGitIgnore
>;

import { resolve } from "node:path";
export const writeGitIgnore = (
  projectDirpath: string,
  gitIgnore: $GitIgnore
) => {
  return fileIO.set(
    resolve(projectDirpath, ".gitignore"),
    Buffer.from(gitIgnore.join("\n"))
  );
};
