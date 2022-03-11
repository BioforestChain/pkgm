import path from "node:path";

class Consts {
  readonly ShadowRootPath = "./.bfsw";
  readonly NpmRootPath = path.join(this.ShadowRootPath, "npm");
}
export const consts = new Consts();
