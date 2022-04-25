declare namespace Bfsp {
  type InternalPredict = (src: string) => boolean;
  type PackageJson = {
    name?: string;
    version?: string;
    dependencies?: Dependencies;
    devDependencies?: Dependencies;
    peerDependencies?: Dependencies;
    optionalDependencies?: Dependencies;
    [name: string]: unknown;
  };

  interface BuildConfig extends Omit<UserConfig, "build"> {
    /**
     * build输出的路径，正常是`dist`
     * 假如设置了 outSubPath: "node"
     * 那么，输出的路径就会变成 `dist/node`
     */
    outSubPath: string;
  }

  interface UserConfig {
    name: string;
    exports: {
      [path in `.` | `./${string}`]: string;
    };
    /**
     * 1. ["chrome74", "node16"]
     * 1. "es2019"
     * 1. default is follow tsConfig.compilerOptions.target
     */
    target?: string | string[];
    formats?: Format[];
    profiles?: string[];
    build?: Partial<BuildConfig>[];
    deps?: string[];
    packageJson?: PackageJson;
    tsConfig?: Bfsp.TsConfig;
    internal?: Iterable<string> | InternalPredict;
  }
  type Dependencies = {
    [name: string]: string;
  };
  type TsReference = { path: string };

  type JsFormat = "cjs" | "esm" | "iife";
  type JsExtension = ".cjs" | ".mjs" | ".js";
  type Format = JsFormat | { format: JsFormat; ext: JsExtension };

  enum BUILD_MODE {
    DEVELOPMENT = "development",
    PRODUCTION = "production",
  }
  // interface ConfigEnvInfo {
  //   mode: BUILD_MODE.DEVELOPMENT | BUILD_MODE.PRODUCTION;
  // }
  interface ConfigEnvInfo {
    mode: import("../src/index").BUILD_MODE;
  }

  type TMap = {
    [key: string];
  };

  type Profile = `#${string}`;
}
