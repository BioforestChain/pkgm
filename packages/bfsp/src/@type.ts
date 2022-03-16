declare namespace NodeJS {
  interface Process {
    noDeprecation: boolean;
    env: {
      LD_LIBRARY_PATH: string;
    } & ProcessEnv;
  }
}

declare namespace PKGM {
  type Print = (format?: any, ...param: any[]) => void;
  type PipeFrom = (stream: import("node:stream").Readable) => void;
  type SuperPrinter = Print & { write: Print; pipeFrom: PipeFrom };
  type Logger = {
    isSuperLogger: true;
    log: SuperPrinter;
    warn: SuperPrinter;
    error: SuperPrinter;
    info: SuperPrinter;
    success: SuperPrinter;
    group: Console["group"];
    groupEnd: Console["groupEnd"];
  };
  type NormalPrinter = Print & Partial<SuperPrinter>;
  type ConsoleLogger = {
    log: NormalPrinter;
    warn: NormalPrinter;
    error: NormalPrinter;
    info: NormalPrinter;
  } & Partial<Omit<Logger, "log" | "warn" | "error" | "info">>;
}
