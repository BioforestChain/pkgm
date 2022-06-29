declare namespace NodeJS {
  interface Process {
    env: {
      LD_LIBRARY_PATH: string;
      PKGM_MODE: string;
    } & ProcessEnv;
  }
}
