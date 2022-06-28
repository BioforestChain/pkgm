import { chalk } from "@bfchain/pkgm-base/lib/chalk.mjs";
import type { RollupError } from "@bfchain/pkgm-base/lib/rollup.mjs";
import type { LogErrorOptions, LogLevel, LogType } from "@bfchain/pkgm-base/lib/vite.mjs";
import { LogLevels, TuiStyle } from "./const.mjs";
import { $LoggerKit, Panel, PanelContext, PanelGroup } from "./Panel.mjs";

export class TscPanel extends Panel<"Tsc"> {
  private _tscLoggerKit?: $LoggerKit;
  get tscLoggerKit() {
    return (this._tscLoggerKit ??= this.createLoggerKit({ name: "tsc", order: 9 }));
  }
  protected $tscLogAllContent = "";
  writeTscLog(text: string, updateStatus: boolean = true) {
    this.tscLoggerKit.writer(text);

    if (updateStatus) {
      const foundErrors = text.match(/Found (\d+) error/);
      if (foundErrors !== null) {
        const errorCount = parseInt(foundErrors[1]);
        if (errorCount > 0) {
          this.updateStatus("error");
        } else {
          this.updateStatus("success");
        }
      } else {
        this.updateStatus("loading");
      }
    }
  }
  clearTscLog() {
    this.tscLoggerKit.clearScreen();
  }
}
export class BundlePanel<N extends string = string> extends Panel<N> {
  protected $viteLoggedErrors = new WeakSet<Error | RollupError>();
  protected $viteLastMsgType: LogType | undefined;
  protected $viteLastMsg: string | undefined;
  protected $viteSameCount = 0;
  protected $viteLogoContent?: string;
  protected $viteLogThresh = LogLevels.info; // 默认打印所有的日志等级

  setLevel(l: LogLevel) {
    this.$viteLogThresh = LogLevels[l];
  }
  hasErrorLogged(error: Error | RollupError) {
    return this.$viteLoggedErrors.has(error);
  }
  protected $formatViteMsg = (type: LogType, msg: string, options: LogErrorOptions) => {
    if (options.timestamp) {
      return `${chalk.dim(new Date().toLocaleTimeString())} ${msg}`;
    } else {
      return msg;
    }
  };
  private _viteLoggerKit?: $LoggerKit;
  get viteLoggerKit() {
    return (this._viteLoggerKit ??= this.createLoggerKit({ name: "vite", order: 9 }));
  }
  getViteLogAllContent() {
    return this.viteLoggerKit.content.all;
  }

  clearViteLogScreen() {
    this.$viteLastMsg = undefined;
    this.$viteLastMsgType = undefined;
    this.$viteSameCount = 0;
    this.viteLoggerKit.clearScreen();
  }
  clearViteLogLine() {
    this.viteLoggerKit.clearLine();
  }
  get viteLogger() {
    return this.viteLoggerKit.logger;
  }
}
export class DevPanel extends BundlePanel<"Dev"> {}
export class BuildPanel extends BundlePanel<"Build"> {
  protected override $renderLog(): void {
    let allContent = "";
    for (const kit of this.$allOrderedLoggerKitList) {
      if (kit.name === "vite" && kit.content.all.length > 0) {
        const logWidth = typeof this.elLog.width === "number" ? this.elLog.width - 3 : 4;
        allContent += chalk.grey("─".repeat(logWidth)) + "\n";
      }
      allContent += kit.content.all;
    }
    this.elLog.setContent(allContent);
  }
}
export class WorkspacesPanel extends Panel<"Workspaces"> {
  get keyShort(): string {
    return "w";
  }
}
export class DepsPanel extends Panel<"Deps"> {
  // 初始化时状态设为success，修复依赖为空时一直处于loading状态
  constructor(_ctx: PanelContext, orderKey: number, readonly name: "Deps") {
    super(_ctx, orderKey, name);
  }

  private _depsLoggerKit?: $LoggerKit;
  get depsLoggerKit() {
    return (this._depsLoggerKit ??= this.createLoggerKit({ name: "deps", order: 9 }));
  }

  get depsLogger() {
    return this.depsLoggerKit.logger;
  }
}

export class CenterMainPanelGroup extends PanelGroup<"Build" | "Deps" | "Dev" | "Tsc"> {
  constructor() {
    super(["Build", "Deps", "Dev", "Tsc"]);
  }
  protected override get $viewStyle() {
    return TuiStyle.leftMain;
  }
  readonly panelKeyOrder = ["Build", "Tsc", "Dev", "Deps"] as const;
}

export class RightSidePanelGroup extends PanelGroup<"Workspaces"> {
  constructor() {
    super(["Workspaces"]);
  }
  protected override get $viewStyle() {
    return TuiStyle.rightSide;
  }
  readonly panelKeyOrder = ["Workspaces"] as const;
}
// export const panelKeyOrder: BFSP.TUI.Panel.Name[] = ["Build", "Tsc", "Dev", "Deps", "Workspaces"];
