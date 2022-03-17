import path from "node:path";
export const ShadowRootPath = "./.bfsp";
export const TscOutRootPath = (root = ShadowRootPath, name = "tsc") => path.join(root, name);
export const TscIsolatedOutRootPath = (root?: string, name?: string) =>
  path.join(TscOutRootPath(root, name), "isolated");
export const TscTypingsOutRootPath = (root?: string, name?: string) => path.join(TscOutRootPath(root, name), "typings");
export const NpmRootPath = path.join(ShadowRootPath, "npm");
export const BuildOutRootPath = "./build";
export const CacheBuildOutRootPath = path.join(ShadowRootPath, "build");
