export namespace Bfsp {
  export interface UserConfig {
    name: string;
    exports?: {
      [path in `.` | `./${string}`]: string;
    };
  }
  export interface ConfigEnvInfo {
    mode: BUILD_MODE;
  }
  export const enum BUILD_MODE {
    DEVELOPMENT = "development",
    PRODUCTION = "production",
  }

  export const defineConfig = (cb: (info: ConfigEnvInfo) => UserConfig) => {
    return cb({
      mode: process.env.mode?.startsWith("prod")
        ? BUILD_MODE.PRODUCTION
        : BUILD_MODE.DEVELOPMENT,
    });
  };
}
