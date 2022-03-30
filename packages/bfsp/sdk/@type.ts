declare namespace NodeJS {
  interface Process {
    noDeprecation: boolean;
    env: {
      LD_LIBRARY_PATH: string;
      PKGM_MODE: string;
    } & ProcessEnv;
  }
}
