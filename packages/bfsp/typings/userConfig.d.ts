declare namespace Bfsp {
  type InternalPredict = (src: string) => boolean;
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
    build?: Partial<Omit<UserConfig, "build">>[];
    deps?: string[];
    packageJson?: {
      name?: string;
      version?: string;
      dependencies?: Dependencies;
      devDependencies?: Dependencies;
      peerDependencies?: Dependencies;
      optionalDependencies?: Dependencies;
      [name: string]: unknown;
    };
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
  interface ConfigEnvInfo {
    mode: import("../src/configs/bfspUserConfig").BUILD_MODE;
  }

  type Profile = `#${string}`;
}
