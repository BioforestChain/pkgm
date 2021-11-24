declare namespace Bfsp {
  interface UserConfig {
    name: string;
    exports: {
      [path in `.` | `./${string}`]: string;
    };
    formats?: Format[];
    profiles?: string[];
    build?: Partial<Omit<UserConfig, "build">>[];
    packageJson?: {
      version: string;
    };
  }
  type JsFormat = "cjs" | "esm" | "iife";
  type JsExtension = ".cjs" | ".mjs" | ".js";
  type Format = JsFormat | { format: JsFormat; ext: JsExtension };
  interface ConfigEnvInfo {
    mode: import("../src/configs/bfspUserConfig").BUILD_MODE;
  }

  type Profile = `#${string}`;
}
