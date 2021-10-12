import type { $ViteConfig } from "./viteConfig";
import packageJsonTemplate from "../../assets/package.template.json?raw";
export const generatePackageJson = async (
  projectDirpath: string,
  viteConfig: $ViteConfig,
  config?: Bfsp.UserConfig
) => {
  const packageJson = JSON.parse(packageJsonTemplate);
  if (config) {
    packageJson.name = config?.name;
  }
  const output = viteConfig.exportsMap.getDefine(viteConfig.indexFile);
  packageJson.main = `dist/${output}.cjs`;
  packageJson.types = `typings/@index.d.ts`; // viteConfig.mainEntry;
  packageJson.exports = {
    ".": {
      require: `dist/${output}.cjs`,
      import: `dist/${output}.mjs`,
    },
  };
  for (const key in viteConfig.viteInput) {
    if (key === output) {
      continue;
    }
    const value = viteConfig.viteInput[key];
    packageJson.exports["./" + key] = {
      require: `dist/${value}.cjs`,
      import: `dist/${value}.mjs`,
    };
  }
  return packageJson as typeof import("../../assets/package.template.json");
};

export type $PackageJson = BFChainUtil.PromiseReturnType<
  typeof generatePackageJson
>;
import { resolve } from "node:path";
import { fileIO } from "../toolkit";
export const writePackageJson = (
  projectDirpath: string,
  packageJson: $PackageJson
) => {
  return fileIO.set(
    resolve(projectDirpath, "package.json"),
    Buffer.from(JSON.stringify(packageJson, null, 2))
  );
};
