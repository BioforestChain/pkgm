import { getBfspUserConfig, watchBfspUserConfig } from "./configs/bfspUserConfig.mjs";
import { $GitIgnore, generateGitIgnore, watchGitIgnore, writeGitIgnore } from "./configs/gitIgnore.mjs";
import { $NpmIgnore, generateNpmIgnore, watchNpmIgnore, writeNpmIgnore } from "./configs/npmIgnore.mjs";
import { $PackageJson, generatePackageJson, watchPackageJson, writePackageJson } from "./configs/packageJson.mjs";
import { $TsConfig, generateTsConfig, watchTsConfig, writeTsConfig } from "./configs/tsConfig.mjs";
import { generateViteConfig, watchViteConfig } from "./configs/viteConfig.mjs";
import { doWatchDeps } from "./deps.mjs";

export const enum BFSP_MODE {
  DEV = "dev",
  BUILD = "build",
  INIT = "init",
}
export const getBfspProjectConfig = async (
  dirname = process.cwd(),
  mode: BFSP_MODE,
  options: { logger: PKGM.Logger }
) => {
  const bfspUserConfig = await getBfspUserConfig(dirname, options);

  const projectConfig = {
    projectDirpath: dirname,
    mode,
    bfspUserConfig,
  };
  return projectConfig;
};
export type $BfspProjectConfig = Awaited<ReturnType<typeof getBfspProjectConfig>>;

export const writeBfspProjectConfig = async (projectConfig: $BfspProjectConfig, options: { logger: PKGM.Logger }) => {
  const { projectDirpath, bfspUserConfig } = projectConfig;

  const tsConfig = await generateTsConfig(projectDirpath, bfspUserConfig, options);
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
  initConfigs: {
    gitIgnore?: BFChainUtil.PromiseMaybe<$GitIgnore>;
    npmIgnore?: BFChainUtil.PromiseMaybe<$NpmIgnore>;
    tsConfig?: BFChainUtil.PromiseMaybe<$TsConfig>;
    packageJson?: BFChainUtil.PromiseMaybe<$PackageJson>;
  },
  options: {
    logger: PKGM.Logger;
  }
) => {
  const { projectDirpath, bfspUserConfig } = projectConfig;

  const userConfigStream = watchBfspUserConfig(projectDirpath, {
    logger: options.logger,
    bfspUserConfigInitPo: bfspUserConfig,
  });
  const tsConfigStream = watchTsConfig(projectDirpath, userConfigStream, {
    logger: options.logger,
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

  let _watchDepsStream: ReturnType<typeof doWatchDeps> | undefined;

  return {
    userConfigStream,
    viteConfigStream,
    tsConfigStream,
    packageJsonStream,
    gitIgnoreStream,
    npmIgnoreStream,
    /**默认不启动 deps 的watch安装，调用后才会运行 */
    getDepsInstallStream() {
      return (_watchDepsStream ??= doWatchDeps(projectDirpath, packageJsonStream, {
        runInstall: true,
        runListGetter() {
          const userConfig = projectConfig.bfspUserConfig.userConfig;
          return [userConfig.packageJson?.name ?? userConfig.name];
        },
      }));
    },
    stopAll() {
      userConfigStream.stop();
      viteConfigStream.stop();
      tsConfigStream.stop();
      packageJsonStream.stop();
      gitIgnoreStream.stop();
      npmIgnoreStream.stop();
      _watchDepsStream?.stop();
    },
  };
};
