import path from "node:path";
export const ShadowRootPath = "./.bfsp";
export const TscOutRootPath = path.join(ShadowRootPath, "tsc");
export const NpmRootPath = path.join(ShadowRootPath, "npm");
export const BuildOutRootPath = "./build";
export const CacheBuildOutRootPath = path.join(ShadowRootPath, "build");
