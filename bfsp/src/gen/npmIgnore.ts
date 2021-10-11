import { fileIO } from "../toolkit";
import { defaultGitIgnores } from "./gitIgnore";
export const defaultNpmIgnores = new Set(defaultGitIgnores);
// 测试文件夹默认不导出
defaultNpmIgnores.add("tests");
defaultNpmIgnores.delete("package.json");

export const generateNpmIgnore = async (
  projectDirpath: string,
  config?: Bfsp.UserConfig
) => {
  let ignores = defaultNpmIgnores;
  const configIgnores = config?.npmignore;
  if (configIgnores !== undefined) {
    if (Array.isArray(configIgnores)) {
      ignores = new Set(configIgnores);
    } else {
      ignores = new Set(ignores);
      if (Array.isArray(configIgnores.include)) {
        for (const rule of configIgnores.include) {
          ignores.add(rule);
        }
      }
      if (Array.isArray(configIgnores.exclude)) {
        for (const rule of configIgnores.exclude) {
          ignores.delete(rule);
        }
      }
    }
  }
  return ignores;
};

export type $NpmIgnore = BFChainUtil.PromiseReturnType<
  typeof generateNpmIgnore
>;

import { resolve } from "node:path";
export const writeNpmIgnore = (
  projectDirpath: string,
  npmIgnore: $NpmIgnore
) => {
  return fileIO.set(
    resolve(projectDirpath, ".npmignore"),
    Buffer.from([...npmIgnore].join("\n"))
  );
};
