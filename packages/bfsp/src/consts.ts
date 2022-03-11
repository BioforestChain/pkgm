import path from "node:path";
class Consts {
  readonly ShadowRootPath = "./.bfsp";
  readonly TscOutRootPath = path.join(this.ShadowRootPath, "tsc");
  readonly NpmRootPath = path.join(this.ShadowRootPath, "npm");
  readonly BuildOutRootPath = "./build";
  readonly CacheBuildOutRootPath = path.join(this.ShadowRootPath, "build");
}
export const consts = new Consts();
