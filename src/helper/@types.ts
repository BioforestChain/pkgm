declare namespace PKGM {
  interface InnerEnv extends Config.ENVS {
    BFSP_SHADOWN_DIRNAME: string;
    BFSP_SHADOWN_DIR: string;
    BFSP_DIR: string;
    BFSP_ROOT_DIR: string;
    BFSP_MAINFILE: string;
    PWD: string;
  }
  namespace Profile {
    type Platform = typeof import('./const').PROFILE_LIST['PLATFORM'][number];
    type JsRuntime = typeof import('./const').PROFILE_LIST['JS_RUNTIME'][number];
    type RuntimeMode = typeof import('./const').PROFILE_LIST['RUNTIME_MODE'][number];
    type Channel = typeof import('./const').PROFILE_LIST['CHANNEL'][number];
  }
}
declare module 'validate-npm-package-name' {
  var validate: (
    name: string
  ) => {
    validForNewPackages: boolean;
    errors: string[];
  };
  export = validate;
}
