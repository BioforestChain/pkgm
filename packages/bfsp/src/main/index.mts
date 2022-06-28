/// <reference path="../../typings/gitIgnore.d.ts" />
/// <reference path="../../typings/npmIgnore.d.ts" />
/// <reference path="../../typings/userConfig.d.ts" />

export const enum BUILD_MODE {
  DEVELOPMENT = "development",
  PRODUCTION = "production",
}

export const defineConfig = (cb: (info: Bfsp.ConfigEnvInfo) => Bfsp.UserConfig) => {
  return {
    ...cb({
      mode: process.env.mode?.startsWith("prod") ? BUILD_MODE.PRODUCTION : BUILD_MODE.DEVELOPMENT,
    }),
    relativePath: "./",
  };
};
