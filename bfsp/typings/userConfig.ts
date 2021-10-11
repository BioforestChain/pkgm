declare namespace Bfsp {
  interface UserConfig {
    name: string;
    exports: {
      [path in `.` | `./${string}`]: string;
    };
  }
  interface ConfigEnvInfo {
    mode: import("../src/userConfig").BUILD_MODE;
  }
}
