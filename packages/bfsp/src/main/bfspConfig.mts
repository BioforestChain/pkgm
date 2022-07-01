import { SharedAsyncIterable } from "../sdk/toolkit/toolkit.stream.mjs";
import { $BfspUserConfig, getBfspUserConfig, watchBfspUserConfig } from "./configs/bfspUserConfig.mjs";
import { $GitIgnore, generateGitIgnore, watchGitIgnore, writeGitIgnore } from "./configs/gitIgnore.mjs";
import { $NpmIgnore, generateNpmIgnore, watchNpmIgnore, writeNpmIgnore } from "./configs/npmIgnore.mjs";
import { $PackageJson, generatePackageJson, watchPackageJson, writePackageJson } from "./configs/packageJson.mjs";
import { $TsConfig, generateTsConfig, watchTsConfig, writeTsConfig } from "./configs/tsConfig.mjs";
import { generateViteConfig, watchViteConfig } from "./configs/viteConfig.mjs";
import { $WatchDepsStream, doWatchDeps } from "./deps.mjs";

export const enum BFSP_MODE {
  DEV = "dev",
  BUILD = "build",
  INIT = "init",
  CLEAR = "clear",
}
export const getBfspProjectConfig = async (
  dirname = process.cwd(),
  mode: BFSP_MODE,
  options: { logger: PKGM.Logger }
) => {
  const bfspUserConfig = await getBfspUserConfig(dirname, options);

  const projectConfig: $BfspProjectConfig = {
    env: {
      projectDirpath: dirname,
      mode,
    },
    user: bfspUserConfig,
  };
  return projectConfig;
};
export type $BfspEnvConfig = {
  projectDirpath: string;
  mode: BFSP_MODE;
};
export type $BfspProjectConfig = {
  env: $BfspEnvConfig;
  user: $BfspUserConfig;
};

export const writeBfspProjectConfig = async (projectConfig: $BfspProjectConfig, options: { logger: PKGM.Logger }) => {
  const { user: bfspUserConfig, env: bfspEnvConfig } = projectConfig;

  const tsConfig = await generateTsConfig(bfspEnvConfig, bfspUserConfig, options);
  const viteConfig = await generateViteConfig(bfspEnvConfig, bfspUserConfig, tsConfig);

  const gitIgnorePo = generateGitIgnore(bfspEnvConfig, bfspUserConfig.userConfig);
  const npmIgnorePo = generateNpmIgnore(bfspEnvConfig, bfspUserConfig.userConfig);
  const packageJsonPo = generatePackageJson(bfspEnvConfig, bfspUserConfig, tsConfig);

  const [_, gitIgnore, npmIgnore, packageJson] = await Promise.all([
    writeTsConfig(bfspEnvConfig, bfspUserConfig, tsConfig),
    gitIgnorePo.then((gitIgnore) => writeGitIgnore(bfspEnvConfig, gitIgnore).then(() => gitIgnore)),
    npmIgnorePo.then((npmIgnore) => writeNpmIgnore(bfspEnvConfig, npmIgnore).then(() => npmIgnore)),
    packageJsonPo.then((packageJson) => writePackageJson(bfspEnvConfig, packageJson).then(() => packageJson)),
  ]);

  return { viteConfig, tsConfig, gitIgnore, npmIgnore, packageJson };
};
export type $WatchBfspProjectConfig = ReturnType<typeof watchBfspProjectConfig>;
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
  debugger;
  const { projectDirpath } = projectConfig.env;
  const { user: bfspUserConfig, env: bfspEnvConfig } = projectConfig;

  const userConfigStream = watchBfspUserConfig(bfspEnvConfig, {
    logger: options.logger,
    bfspUserConfigInitPo: bfspUserConfig,
  });
  const tsConfigStream = watchTsConfig(bfspEnvConfig, userConfigStream, {
    logger: options.logger,
    tsConfigInitPo: initConfigs.tsConfig,
    write: true,
  });
  const viteConfigStream = watchViteConfig(bfspEnvConfig, userConfigStream, tsConfigStream);

  const packageJsonStream = watchPackageJson(bfspEnvConfig, userConfigStream, tsConfigStream, {
    write: true,
    packageJsonInitPo: initConfigs.packageJson,
  });

  const gitIgnoreStream = watchGitIgnore(bfspEnvConfig, userConfigStream, {
    gitIgnoreInitPo: initConfigs.gitIgnore,
    write: true,
  });

  const npmIgnoreStream = watchNpmIgnore(bfspEnvConfig, userConfigStream, {
    npmIgnoreInitPo: initConfigs.npmIgnore,
    write: true,
  });

  let _watchDepsStream: $WatchDepsStream | undefined;

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
          const userConfig = projectConfig.user.userConfig;
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
