import path from "node:path";
import { readFileSync } from "node:fs";
import { require } from "../toolkit/commonjs_require.mjs";
let yarnPath: string | undefined;
export const getYarnPath = () => {
  if (yarnPath === undefined) {
    const packageJsonFile = require.resolve("yarn/package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonFile, "utf-8"));
    yarnPath = path.join(path.dirname(packageJsonFile), packageJson.bin.yarn);
  }
  return yarnPath;
};
