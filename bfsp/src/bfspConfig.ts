import { getBfspUserConfig, watchBfspUserConfig } from "./configs/bfspUserConfig";
import { $GitIgnore, generateGitIgnore, watchGitIgnore, writeGitIgnore } from "./configs/gitIgnore";
import { $NpmIgnore, generateNpmIgnore, watchNpmIgnore, writeNpmIgnore } from "./configs/npmIgnore";
import { $PackageJson, generatePackageJson, watchPackageJson, writePackageJson } from "./configs/packageJson";
import { $TsConfig, generateTsConfig, watchTsConfig, writeTsConfig } from "./configs/tsConfig";
import { $ViteConfig, generateViteConfig, watchViteConfig } from "./configs/viteConfig";
import { BuildService } from "./core";

export const getBfspProjectConfig = async (dirname = process.cwd()) => {
  const bfspUserConfig = await getBfspUserConfig(dirname);

  const projectConfig = {
    projectDirpath: dirname,
    bfspUserConfig,
  };
  return projectConfig;
};
export type $BfspProjectConfig = BFChainUtil.PromiseReturnType<typeof getBfspProjectConfig>;

export const writeBfspProjectConfig = async (projectConfig: $BfspProjectConfig, buildService: BuildService) => {
  const { projectDirpath, bfspUserConfig } = projectConfig;

  const tsConfig = await generateTsConfig(projectDirpath, bfspUserConfig, buildService);
  const viteConfig = await generateViteConfig(projectDirpath, bfspUserConfig, tsConfig);

  const gitIgnorePo = generateGitIgnore(projectDirpath, bfspUserConfig.userConfig);
  const npmIgnorePo = generateNpmIgnore(projectDirpath, bfspUserConfig.userConfig);
  const packageJsonPo = generatePackageJson(projectDirpath, bfspUserConfig, tsConfig);

  const [_, gitIgnore, npmIgnore, packageJson] = await Promise.all([
    writeTsConfig(projectDirpath, bfspUserConfig, tsConfig),
    gitIgnorePo.then((gitIgnore) => writeGitIgnore(projectDirpath, gitIgnore).then(() => gitIgnore)),
    npmIgnorePo.then((npmIgnore) => writeNpmIgnore(projectDirpath, npmIgnore).then(() => npmIgnore)),
    packageJsonPo.then((packageJson) => writePackageJson(projectDirpath, packageJson).then(() => packageJson)),
  ]);

  return { viteConfig, tsConfig, gitIgnore, npmIgnore, packageJson };
};

export const watchBfspProjectConfig = (
  projectConfig: $BfspProjectConfig,
  buildService: BuildService,
  initConfigs: {
    gitIgnore?: BFChainUtil.PromiseMaybe<$GitIgnore>;
    npmIgnore?: BFChainUtil.PromiseMaybe<$NpmIgnore>;
    tsConfig?: BFChainUtil.PromiseMaybe<$TsConfig>;
    packageJson?: BFChainUtil.PromiseMaybe<$PackageJson>;
  }
) => {
  const { projectDirpath, bfspUserConfig } = projectConfig;

  const userConfigStream = watchBfspUserConfig(projectDirpath, buildService, {
    bfspUserConfigInitPo: bfspUserConfig,
  });
  const tsConfigStream = watchTsConfig(projectDirpath, userConfigStream, buildService, {
    tsConfigInitPo: initConfigs.tsConfig,
    write: true,
  });
  const viteConfigStream = watchViteConfig(projectDirpath, userConfigStream, tsConfigStream);

  const packageJsonStream = watchPackageJson(projectDirpath, userConfigStream, tsConfigStream, {
    write: true,
    packageJsonInitPo: initConfigs.packageJson,
  });

  const gitIgnoreStream = watchGitIgnore(projectDirpath, userConfigStream, {
    gitIgnoreInitPo: initConfigs.gitIgnore,
    write: true,
  });

  const npmIgnoreStream = watchNpmIgnore(projectDirpath, userConfigStream, {
    npmIgnoreInitPo: initConfigs.npmIgnore,
    write: true,
  });

  return {
    userConfigStream,
    viteConfigStream,
    tsConfigStream,
    packageJsonStream,
    gitIgnoreStream,
    npmIgnoreStream,
    stopAll() {
      userConfigStream.stop();
      viteConfigStream.stop();
      tsConfigStream.stop();
      packageJsonStream.stop();
      gitIgnoreStream.stop();
      npmIgnoreStream.stop();
    },
  };
};
