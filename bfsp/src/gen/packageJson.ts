import { resolve } from "node:path";
import packageJsonTemplate from "../../assets/package.template.json?raw";
import { fileIO } from "../toolkit";
import type { $BfspUserConfig } from "../userConfig";

export const generatePackageJson = async (
  projectDirpath: string,
  bfspUserConfig: $BfspUserConfig
) => {
  const packageJson = JSON.parse(packageJsonTemplate);
  packageJson.name = bfspUserConfig.userConfig.name;
  const indexOutput = bfspUserConfig.exportsDetail.exportsMap.getDefine(
    bfspUserConfig.exportsDetail.indexFile
  );
  packageJson.main = `dist/${indexOutput}.cjs`;
  packageJson.types = `typings/@index.d.ts`; // viteConfig.mainEntry;
  packageJson.exports = {
    ".": {
      require: `dist/${indexOutput}.cjs`,
      import: `dist/${indexOutput}.mjs`,
    },
  };
  for (const [output, input] of bfspUserConfig.exportsDetail.exportsMap
    .oi_cache) {
    if (output === indexOutput) {
      continue;
    }
    packageJson.exports["./" + output] = {
      require: `dist/${input}.cjs`,
      import: `dist/${input}.mjs`,
    };
  }
  return packageJson as typeof import("../../assets/package.template.json");
};

export type $PackageJson = BFChainUtil.PromiseReturnType<
  typeof generatePackageJson
>;
export const writePackageJson = (
  projectDirpath: string,
  packageJson: $PackageJson
) => {
  return fileIO.set(
    resolve(projectDirpath, "package.json"),
    Buffer.from(JSON.stringify(packageJson, null, 2))
  );
};
