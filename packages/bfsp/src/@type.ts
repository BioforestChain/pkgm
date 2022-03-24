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
  type Pin = (label: string, format?: any, ...param: any[]) => void;
  type UnPin = (label: string) => void;
  type Clear = () => void;
  type PipeFrom = (stream: import("node:stream").Readable) => void;
  type SuperPrinter = Print & { write: Print; pin: Pin; unpin: UnPin; pipeFrom: PipeFrom };
  type Logger = {
    isSuperLogger: true;
    log: SuperPrinter;
    warn: SuperPrinter;
    error: SuperPrinter;
    info: SuperPrinter;
    success: SuperPrinter;
    group: Console["group"];
    groupEnd: Console["groupEnd"];
    clear: Clear;
    loadingStart: (label: string) => void;
    loadingLog: (label: string, ...param: any[]) => void;
    loadingEnd: (label: string) => void;
    hasLoading: (label: string) => boolean;
    progressStart: (label: string, total: number, current?: number) => void;
    // progressUpdate: (label: string, current: number, total: number) => void;
    progressLog: (label: string, current: number, ...param: any[]) => void;
    progressEnd: (label: string) => void;
  };

  type NormalPrinter = Print & Partial<SuperPrinter>;
  type SimpleLogger = {
    log: NormalPrinter;
    warn: NormalPrinter;
    error: NormalPrinter;
    info: NormalPrinter;
    clear: Clear;
  };
  type ConsoleLogger = SimpleLogger & Partial<Omit<Logger, keyof SimpleLogger>>;

  type TuiLogger = Logger & {
    panel?: import("./tui").Panel<any>;
  };
}
