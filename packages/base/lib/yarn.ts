import path from "node:path";
import { readFileSync } from "node:fs";
import { require } from "../src/toolkit.require";
export const getYarnPath = () => {
  const packageJsonFile = require.resolve("yarn/package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonFile, "utf-8"));
  return path.join(path.dirname(packageJsonFile), packageJson.bin.yarn);
};
