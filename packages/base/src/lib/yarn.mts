import path from "node:path";
import { readFileSync } from "node:fs";
import { require } from "../toolkit/toolkit.require.mjs";
let yarnPath: string | undefined;
export const getYarnPath = () => {
  if (yarnPath === undefined) {
    const packageJsonFile = require.resolve("yarn/package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonFile, "utf-8"));
    yarnPath = path.join(path.dirname(packageJsonFile), packageJson.bin.yarn);
  }
  return yarnPath;
};

let yarnCli: { start: () => Promise<void> } | undefined;
export const getYarnCli = () => {
  if (yarnCli === undefined) {
    const packageJsonFile = require.resolve("yarn/package.json");
    yarnCli = require(path.join(path.dirname(packageJsonFile), "lib/cli.js"));
  }
  return yarnCli!;
};
