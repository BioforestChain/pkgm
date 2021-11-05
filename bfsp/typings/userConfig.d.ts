declare namespace Bfsp {
  interface UserConfig {
    name: string;
    exports: {
      [path in `.` | `./${string}`]: string;
    };
    formats?: Format[];
    profiles?: string[];
    build?: Partial<UserConfig>[];
    packageJson?: {
      version: string;
    };
  }

  type Format = "cjs" | "esm" | "iife";
  interface ConfigEnvInfo {
    mode: import("../src/configs/bfspUserConfig").BUILD_MODE;
  }

  type Profile = `#${string}`;
}
