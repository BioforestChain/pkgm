import path from "node:path";
import { $TsConfig, jsonClone, writeJsonConfig, runTsc, createTscLogger } from "../sdk";

export class TypingsGenerator {
  private _root!: string;
  private _tsConfig!: $TsConfig;
  private _logger!: ReturnType<typeof this._createAggregatedLogger>;
  private _generateStoppable?: Awaited<ReturnType<typeof runTsc>>;
  private _checkIsolatedStoppable?: Awaited<ReturnType<typeof runTsc>>;

  private _errors = {
    isolated: false,
    typings: false,
  };
  private _completed = {
    isolated: false,
    typings: false,
  };
  constructor(opts: { logger: ReturnType<typeof createTscLogger>; root: string; tsConfig: $TsConfig }) {
    this._root = opts.root;
    this._tsConfig = opts.tsConfig;
    this._logger = this._createAggregatedLogger(opts.logger);
  }
  // 为了让Tsc面板的状态能够正确显示。
  private _createAggregatedLogger(tscLogger: ReturnType<typeof createTscLogger>) {
    const err = this._errors;
    const completed = this._completed;
    return {
      write: (s: string, tag: "typings" | "isolated") => {
        let needWrite = true;
        if (tag === "isolated") {
          if (/TS1208|TS6307/.test(s)) {
            err.isolated = true;
          } else {
            needWrite = false;
          }
        }

        const foundErrors = s.match(/Found (\d+) error/);
        if (foundErrors !== null) {
          const errorCount = parseInt(foundErrors[1]);
          completed[tag] = true;
          if (tag === "typings") {
            err.typings = errorCount > 0;
          }
        }
        if (needWrite) {
          tscLogger.write(s, false);
          tscLogger.updateStatus(err.isolated || err.typings ? "error" : "success");
        }
        if (completed.isolated && completed.typings) {
          this.stop();
        }
      },
      clear: (tag: "typings" | "isolated") => {
        err[tag] = false;
        completed[tag] = false;
        tscLogger.clear();
      },
    };
  }
  async generate() {
    if (!this._generateStoppable) {
      this._generateStoppable = await this._generate();
    }
    if (!this._checkIsolatedStoppable) {
      this._checkIsolatedStoppable = await this._checkIsolated();
    }
  }
  stop() {
    this._generateStoppable?.stop();
    this._checkIsolatedStoppable?.stop();
  }

  private async _generate() {
    const cfg = jsonClone(this._tsConfig.typingsJson);
    cfg.files = [...cfg.files, ...this._tsConfig.isolatedJson.files];
    cfg.compilerOptions.isolatedModules = false;
    cfg.compilerOptions.noEmit = false;
    cfg.compilerOptions.emitDeclarationOnly = true;

    const p = path.join(this._root, "tsconfig.typings.json");
    await writeJsonConfig(p, cfg);

    return new Promise<ReturnType<typeof runTsc>>((resolve) => {
      const ret = runTsc({
        tsconfigPath: p,
        watch: true,
        onMessage: (s) => this._logger.write(s, "typings"),
        onSuccess: () => resolve(ret),
        onClear: () => this._logger.clear("typings"),
      });
    });
  }
  private async _checkIsolated() {
    const cfg = jsonClone(this._tsConfig.isolatedJson);
    cfg.compilerOptions.isolatedModules = true;
    cfg.compilerOptions.noEmit = true;
    cfg.compilerOptions.typeRoots = [path.join(this._tsConfig.typingsJson.compilerOptions.outDir, "..")];
    cfg.compilerOptions.types = ["typings"];
    Reflect.deleteProperty(cfg, "references");

    const p = path.join(this._root, "tsconfig.isolated.json");
    await writeJsonConfig(p, cfg);

    return runTsc({
      tsconfigPath: p,
      watch: true,
      onMessage: (s) => this._logger.write(s, "isolated"),
      onClear: () => this._logger.clear("isolated"),
    });
  }
}
