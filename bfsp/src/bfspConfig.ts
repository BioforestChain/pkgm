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

export const getBfspProjectConfig = async (dirname = process.cwd()) => {
  const bfspUserConfig = await getBfspUserConfig(dirname);

  const projectConfig = {
    projectDirpath: dirname,
    bfspUserConfig,
  };
  return projectConfig;
};
export type $BfspProjectConfig = BFChainUtil.PromiseReturnType<
  typeof getBfspProjectConfig
>;

export const writeBfspProjectConfig = async (
  projectConfig: $BfspProjectConfig
) => {
  const { projectDirpath, bfspUserConfig } = projectConfig;

  const viteConfig = await generateViteConfig(projectDirpath, bfspUserConfig);
  const tsConfigPo = generateTsConfig(projectDirpath, bfspUserConfig);

  const gitIgnorePo = generateGitIgnore(
    projectDirpath,
    bfspUserConfig.userConfig
  );
  const npmIgnorePo = generateNpmIgnore(
    projectDirpath,
    bfspUserConfig.userConfig
  );
  const packageJsonPo = generatePackageJson(projectDirpath, bfspUserConfig);

  const [tsConfig, gitIgnore, npmIgnore, packageJson] = await Promise.all([
    tsConfigPo.then((tsConfig) =>
      writeTsConfig(projectDirpath, bfspUserConfig, tsConfig).then(
        () => tsConfig
      )
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
  const { projectDirpath, bfspUserConfig } = projectConfig;

  const userConfigStream = watchBfspUserConfig(projectDirpath, bfspUserConfig);
  const viteConfigStream = watchViteConfig(projectDirpath, userConfigStream);
  const tsConfigStream = watchTsConfig(
    projectDirpath,
    initConfigs.tsConfig,
    userConfigStream,
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
