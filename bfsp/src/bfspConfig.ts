import { getBfspUserConfig, watchBfspUserConfig } from "./userConfig";
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
import {
  $ViteConfig,
  generateViteConfig,
  watchViteConfig,
} from "./gen/viteConfig";

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
  projectConfig: $BfspProjectConfig
) => {
  const { projectDirpath, userConfig } = projectConfig;

  const viteConfig = await generateViteConfig(projectDirpath, userConfig);
  const tsConfigPo = generateTsConfig(projectDirpath, viteConfig, userConfig);

  const gitIgnorePo = generateGitIgnore(projectDirpath, userConfig);
  const npmIgnorePo = generateNpmIgnore(projectDirpath, userConfig);
  const packageJsonPo = generatePackageJson(
    projectDirpath,
    viteConfig,
    userConfig
  );

  const [tsConfig, gitIgnore, npmIgnore, packageJson] = await Promise.all([
    tsConfigPo.then((tsConfig) =>
      writeTsConfig(projectDirpath, viteConfig, tsConfig).then(() => tsConfig)
    ),
    gitIgnorePo.then((gitIgnore) =>
      writeGitIgnore(projectDirpath, gitIgnore).then(() => gitIgnore)
    ),
    npmIgnorePo.then((npmIgnore) =>
      writeNpmIgnore(projectDirpath, npmIgnore).then(() => npmIgnore)
    ),
    packageJsonPo.then((packageJson) =>
      writePackageJson(projectDirpath, packageJson).then(() => packageJson)
    ),
  ]);

  return { viteConfig, tsConfig, gitIgnore, npmIgnore, packageJson };
};

export const watchBfspProjectConfig = (
  projectConfig: $BfspProjectConfig,
  initConfigs: {
    tsConfig: BFChainUtil.PromiseMaybe<$TsConfig>;
  }
) => {
  const { projectDirpath, userConfig } = projectConfig;

  const userConfigStream = watchBfspUserConfig(projectDirpath, userConfig);
  const viteConfigStream = watchViteConfig(projectDirpath, userConfigStream);
  const tsConfigStream = watchTsConfig(
    projectDirpath,
    initConfigs.tsConfig,
    viteConfigStream,
    {
      write: true,
    }
  );

  return {
    userConfigStream,
    viteConfigStream,
    tsConfigStream,
  };
};
