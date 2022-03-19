declare namespace NodeJS {
  interface Process {
    noDeprecation: boolean;
    env: {
      LD_LIBRARY_PATH: string;
      PKGM_MODE: string;
    } & ProcessEnv;
  }
}

declare namespace PKGM {
  type Print = (format?: any, ...param: any[]) => void;
  type Clear = () => void;
  type PipeFrom = (stream: import("node:stream").Readable) => void;
  type SuperPrinter = Print & { write: Print; line: Print; pipeFrom: PipeFrom };
  type Logger = {
    isSuperLogger: true;
    log: SuperPrinter;
    warn: SuperPrinter;
    error: SuperPrinter;
    info: SuperPrinter;
    success: SuperPrinter;
    group: Console["group"];
    groupEnd: Console["groupEnd"];
    clearScreen: Clear;
    clearLine: Clear;
  };

  type NormalPrinter = Print & Partial<SuperPrinter>;
  type SimpleLogger = {
    log: NormalPrinter;
    warn: NormalPrinter;
    error: NormalPrinter;
    info: NormalPrinter;
    clearScreen: Clear;
    clearLine: Clear;
  };
  type ConsoleLogger = SimpleLogger & Partial<Omit<Logger, keyof SimpleLogger>>;
}
