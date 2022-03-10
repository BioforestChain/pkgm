declare namespace Bfsp {
  type InternalPredict = (src: string) => boolean;
  interface UserConfig {
    name: string;
    exports: {
      [path in `.` | `./${string}`]: string;
    };
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
    tsConfig?: {
      compilerOptions?: {
        [name: string]: unknown;
      };
    };
    internal?: Iterable<string> | InternalPredict;
  }
  type Dependencies = {
    [name: string]: string;
  };

  type JsFormat = "cjs" | "esm" | "iife";
  type JsExtension = ".cjs" | ".mjs" | ".js";
  type Format = JsFormat | { format: JsFormat; ext: JsExtension };
  interface ConfigEnvInfo {
    mode: import("../src/configs/bfspUserConfig").BUILD_MODE;
  }

  type Profile = `#${string}`;
}
