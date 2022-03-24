import { Widgets } from "@bfchain/pkgm-base/lib/blessed";
import { chalk } from "@bfchain/pkgm-base/lib/chalk";
import type { RollupError } from "@bfchain/pkgm-base/lib/rollup";
import type { LogErrorOptions, LogLevel, LogType } from "@bfchain/pkgm-base/lib/vite";
import { createSuperLogger } from "../SuperLogger";
import { LogLevels, TuiStyle } from "./const";
import { $LoggerKit, Panel, PanelContext, PanelGroup } from "./Panel";

export class TscPanel extends Panel<"Tsc"> {
  private _tscLoggerKit?: $LoggerKit;
  get tscLoggerKit() {
    return (this._tscLoggerKit ??= this.createLoggerKit({ name: "tsc", order: 9 }));
  }
  protected $tscLogAllContent = "";
  writeTscLog(text: string) {
    this.tscLoggerKit.writer(text);

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
  private get viteLoggerKit() {
    return (this._viteLoggerKit ??= this.createLoggerKit({ name: "vite", order: 9 }));
  }
  writeViteLog(type: LogType, msg: string, options: LogErrorOptions = {}) {
    /// 移除 logo
    if (this.$viteLogoContent === undefined) {
      if (msg.includes("vite")) {
        const blankMsg = msg.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "");
        const viteVersion = blankMsg.match(/^vite v[\d\.]+/);
        if (viteVersion) {
          this.$viteLogoContent = msg;
          this._ctx.debug(msg);
          return;
        }
      }
    } else if (this.$viteLogoContent === msg) {
      return;
    }

    if (this.$viteLogThresh >= LogLevels[type]) {
      if (options.error) {
        this.$viteLoggedErrors.add(options.error);
      }

      const { content } = this.viteLoggerKit;
      if (options.clear && type === this.$viteLastMsgType && msg === this.$viteLastMsg) {
        this.$viteSameCount++;
        content.all =
          content.all.slice(0, -content.last.length) +
          (content.last =
            this.$formatViteMsg(type, msg, options) + ` ${chalk.yellow(`(x${this.$viteSameCount + 1})`)}\n`);
      } else {
        this.$viteSameCount = 0;
        this.$viteLastMsg = msg;
        this.$viteLastMsgType = type;
        content.all = content.all + (content.last = this.$formatViteMsg(type, msg, options) + `\n`);
      }
      this.$queueRenderLog();

      /**
       * @TODO 这里需要修改updateStatus的行为，应该改成 addStatus(flag,type) 。从而允许多个实例同时操作这个status
       */
      if (type !== "info") {
        this.updateStatus(type);
      }
    }
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
    // this.$viteLastMsg = undefined;
    // this.$viteLastMsgType = undefined;
    // this.$viteSameCount = 0;
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
