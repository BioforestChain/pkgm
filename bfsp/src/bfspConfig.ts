import { getBfspUserConfig } from "./userConfig";
import { $GitIgnore, generateGitIgnore, writeGitIgnore } from "./gen/gitIgnore";
import { $NpmIgnore, generateNpmIgnore, writeNpmIgnore } from "./gen/npmIgnore";
import {
  $PackageJson,
  generatePackageJson,
  writePackageJson,
} from "./gen/packageJson";
import {
  $TsConfig,
  generateTsConfig,
  watchTsConfig,
  writeTsConfig,
} from "./gen/tsConfig";
import { $ViteConfig, generateViteConfig } from "./gen/viteConfig";

export interface $BfspProjectConfig {
  projectDirpath: string;
  userConfig: Bfsp.UserConfig;
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
  projectConfig: $BfspProjectConfig,
  options: { watch?: boolean } = {}
) => {
  const { projectDirpath, userConfig } = projectConfig;
  const { watch = false } = options;

  const tsConfigPo = generateTsConfig(projectDirpath, userConfig);

  const viteConfigPo = generateViteConfig(projectDirpath, userConfig);
  const gitIgnorePo = generateGitIgnore(projectDirpath, userConfig);
  const npmIgnorePo = generateNpmIgnore(projectDirpath, userConfig);
  const packageJsonPo = viteConfigPo.then((viteConfig) =>
    generatePackageJson(projectDirpath, viteConfig, userConfig)
  );
  if (watch) {
    watchTsConfig(projectDirpath, tsConfigPo);
  }

  await Promise.all([
    tsConfigPo.then((tsConfig) => writeTsConfig(projectDirpath, tsConfig)),
    gitIgnorePo.then((gitIgnore) => writeGitIgnore(projectDirpath, gitIgnore)),
    npmIgnorePo.then((npmIgnore) => writeNpmIgnore(projectDirpath, npmIgnore)),
    packageJsonPo.then((packageJson) =>
      writePackageJson(projectDirpath, packageJson)
    ),
  ]);
};
