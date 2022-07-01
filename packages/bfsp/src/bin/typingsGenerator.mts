import path from "node:path";
import { $TsConfig, jsonClone, writeJsonConfig, runTsc, createTscLogger } from "../sdk/index.mjs";

export type ModeType = "bfsp" | "bfsw";

export class TypingsGenerator {
  private _root!: string;
  private _tsConfig!: $TsConfig;
  private _logger!: ReturnType<typeof this._createAggregatedLogger>;
  private _generateStoppable?: Awaited<ReturnType<typeof runTsc>>;
  private _checkIsolatedStoppable?: Awaited<ReturnType<typeof runTsc>>;
  private _mode: ModeType;

  private _errors = {
    isolated: false,
    typings: false,
  };
  private _completed = {
    isolated: false,
    typings: false,
  };
  constructor(opts: {
    logger: ReturnType<typeof createTscLogger>;
    root: string;
    tsConfig: $TsConfig;
    mode?: ModeType;
  }) {
    this._root = opts.root;
    this._tsConfig = opts.tsConfig;
    this._logger = this._createAggregatedLogger(opts.logger);
    this._mode = opts.mode ?? "bfsw";
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

  /**
   *
   * @param indexFile 传递入口给tsc
   */
  async generate(indexFile: string) {
    if (!this._generateStoppable) {
      this._generateStoppable = await this._generate();
    }
    if (!this._checkIsolatedStoppable) {
      this._checkIsolatedStoppable = await this._checkIsolated(indexFile);
    }
  }
  stop() {
    if (this._mode !== "bfsp") {
      this._generateStoppable?.stop();
    }
    this._checkIsolatedStoppable?.stop();
  }

  private async _generate() {
    const cfg = jsonClone(this._tsConfig.typingsJson);
    cfg.files = [...cfg.files, ...this._tsConfig.isolatedJson.files];
    const opts = cfg.compilerOptions;
    opts.isolatedModules = false;
    opts.noEmit = false;
    opts.emitDeclarationOnly = true;

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

  private async _checkIsolated(indexFile: string) {
    const cfg = jsonClone(this._tsConfig.isolatedJson);
    const opts = cfg.compilerOptions;
    opts.isolatedModules = true;
    opts.noEmit = true;

    // const typingsOutDir = this._tsConfig.typingsJson.compilerOptions.outDir;
    // // 如果入口没有在根目录，那么需要把类型文件也相对入口文件位置移动,否则会报类型不存在
    // if (path.dirname(indexFile) !== ".") {
    //   opts.typeRoots = [typingsOutDir];
    //   opts.types = [path.basename(path.dirname(indexFile))];
    // } else {
    //   // 如果入口函数在根目录，不用加上入口函数的相对位置
    //   opts.typeRoots = [path.dirname(typingsOutDir)];
    //   opts.types = [path.basename(typingsOutDir)];
    // }
    Reflect.deleteProperty(cfg, "references");

    const p = path.join(this._root, "tsconfig.isolated.json");
    await writeJsonConfig(p, cfg);

    return runTsc({
      tsconfigPath: p,
      // watch: true,
      onMessage: (s) => this._logger.write(s, "isolated"),
      onClear: () => this._logger.clear("isolated"),
    });
  }
}
