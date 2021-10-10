import { config } from "process";
import { $GitIgnore, generateGitIgnore, writeGitIgnore } from "./gen/gitIgnore";
import {
  $PackageJson,
  generatePackageJson,
  writePackageJson,
} from "./gen/packageJson";
import { $TsConfig, generateTsConfig, writeTsConfig } from "./gen/tsConfig";
import {
  $ViteConfig,
  generateViteConfig,
  // writeViteConfig,
} from "./gen/viteConfig";
import { getBfspUserConfig, BfspUserConfig } from "./userConfig";

export interface $BfspProjectConfig {
  projectDirpath: string;
  userConfig: BfspUserConfig;
  // tsConfig: $TsConfig;
  // viteConfig: $ViteConfig;
  // gitIgnore: $GitIgnore;
  // packageJson: $PackageJson;
}

export const getBfspProjectConfig = async (dirname = process.cwd()) => {
  const userConfig = await getBfspUserConfig(dirname);
  if (userConfig === undefined) {
    return;
  }

  const projectConfig: $BfspProjectConfig = {
    projectDirpath: dirname,
    userConfig,
  };
  return projectConfig;
};

export const writeBfspProjectConfig = async (
  projectConfig: $BfspProjectConfig
) => {
  const { projectDirpath, userConfig } = projectConfig;

  const tsConfigPo = generateTsConfig(projectDirpath, userConfig);
  const viteConfigPo = generateViteConfig(projectDirpath, userConfig);
  const gitIgnorePo = generateGitIgnore(projectDirpath, userConfig);
  const packageJsonPo = viteConfigPo.then((viteConfig) =>
    generatePackageJson(projectDirpath, viteConfig, userConfig)
  );
  await Promise.all([
    tsConfigPo.then((tsConfig) => writeTsConfig(projectDirpath, tsConfig)),
    // viteConfigPo.then((viteConfig) =>
    //   writeViteConfig(projectDirpath, viteConfig)
    // ),
    gitIgnorePo.then((gitIgnore) => writeGitIgnore(projectDirpath, gitIgnore)),
    packageJsonPo.then((packageJson) =>
      writePackageJson(projectDirpath, packageJson)
    ),
  ]);
};
