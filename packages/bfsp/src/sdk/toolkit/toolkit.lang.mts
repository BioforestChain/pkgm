import path from "node:path";
import type { BuildResult } from "@bfchain/pkgm-base/lib/esbuild.mjs";

import { ignoresCache } from "./toolkit.fs.mjs";
import { getTwoExtnames, $PathInfo, toPosixPath } from "./toolkit.path.mjs";

export const isEqualSet = <T extends unknown>(set1: Set<T>, set2?: Set<T>) => {
  if (set2 === undefined) {
    return;
  }
  if (set1 === set2) {
    return true;
  }
  if (set1.size !== set2.size) {
    return false;
  }
  for (const item of set1) {
    if (set2.has(item) === false) {
      return false;
    }
  }
  return true;
};

export const isTsExt = (extname: string) => {
  return (
    extname === ".ts" ||
    extname === ".tsx" ||
    extname === ".cts" ||
    extname === ".mts" ||
    extname === ".ctsx" ||
    extname === ".mtsx"
  );
};

export const isTypeFile = (projectDirpath: string, filepath: string) =>
  filepath.endsWith(".type.ts") || filepath.startsWith("./typings/");

export const isTestFile = (projectDirpath: string, filepath: string) => {
  const exts = getTwoExtnames(filepath);
  if (exts !== undefined) {
    return ".test" === exts.ext2 || (filepath.startsWith("./tests/") && ".bm" === exts.ext2);
  }
  return false;
};

export const isBinFile = (projectDirpath: string, filepath: string) => {
  if (filepath.startsWith("./bin/")) {
    const exts = getTwoExtnames(filepath);
    if (exts !== undefined) {
      return isTsExt(exts.ext1) && (".cmd" === exts.ext2 || ".tui" === exts.ext2);
    }
  }
  return false;
};

export const isTsFile = (filepathInfo: $PathInfo) => {
  const { relative } = filepathInfo;
  if (relative.endsWith("#bfsp.ts")) {
    return false;
  }
  const { extname } = filepathInfo;
  if (
    /// 在assets文件夹下的json文件
    (extname === ".json" && toPosixPath(filepathInfo.relative).startsWith("./assets/")) ||
    /// ts文件（忽略类型定义文件）
    (isTsExt(extname) && ".d" !== filepathInfo.secondExtname)
  ) {
    return notGitIgnored(filepathInfo.full); // promise<boolean>
  }
  return false;
};

export const printBuildResultWarnAndError = (logger: PKGM.Logger, buildResult: BuildResult) => {
  if (buildResult.warnings.length > 0) {
    for (const warn of buildResult.warnings) {
      logger.warn(warn.text);
    }
  }
  if (buildResult.errors.length > 0) {
    for (const err of buildResult.errors) {
      logger.error(err.text);
    }
    return true;
  }
  return false;
};

export const isGitIgnored = async (somefullpath: string) => {
  const ignores = await ignoresCache.get(path.dirname(somefullpath));
  return ignores(somefullpath);
};
export const notGitIgnored = async (somefullpath: string) => {
  const ignores = await ignoresCache.get(path.dirname(somefullpath));
  return ignores(somefullpath) === false;
};
