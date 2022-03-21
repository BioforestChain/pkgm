import { chalk } from "@bfchain/pkgm-base/lib/chalk";
import { blessed, Widgets } from "@bfchain/pkgm-base/lib/blessed";
import { afm } from "./animtion";
import { FRAMES, getBaseWidgetOptions, H_LOG, H_NAV, TuiStyle, T_NAV, W_MAIN } from "./const";
import { createSuperLogger } from "../SuperLogger";

export interface PanelContext {
  debug(log: string): void;
}
export abstract class Panel<N extends string, K extends number = number> implements BFSP.TUI.Panel<N, K> {
  constructor(
    protected _ctx: PanelContext,
    /**数字快捷键 */
    public orderKey: K,
    readonly name: N
  ) {
    this.deactivate();
    this.updateStatus(this._status);
  }
  private _status: PanelStatus = "loading";
  get status() {
    return this._status;
  }
  private _loadingFrameId = 0;
  private _isActive = true;
  readonly elLog = blessed.log(TuiStyle.logPanel);
  readonly elMenu = blessed.box({});
  onStatusChange?: StatusChangeCallback;
  updateStatus(s: PanelStatus) {
    if (s === this._status) {
      return;
    }
    this._status = s;
    this.onStatusChange?.(s, this);
    this._render();
  }
  private _ani_pid?: number;
  private _render() {
    if (this._status === "loading") {
      this._loadingFrameId++;
      if (this._ani_pid === undefined) {
        this._ani_pid = afm.requestAnimationFrame(() => {
          this._ani_pid = undefined;
          this._render();
        });
      }
    } else {
      this._loadingFrameId = 0;
      if (this._ani_pid !== undefined) {
        afm.cancelAnimationFrame(this._ani_pid);
        this._ani_pid = undefined;
      }
    }
    this.elMenu.content = this._buildMenuContent();
  }
  private _buildMenuContent() {
    let c = "";
    // state
    if (this._status === "loading") {
      c += FRAMES[this._loadingFrameId % FRAMES.length];
    } else if (this._status === "warn") {
      c += chalk.yellow.bold("!");
    } else if (this._status === "success") {
      c += chalk.green.bold("✓");
    } else if (this._status === "error") {
      c += chalk.red.bold("x");
    }

    c += " ";
    // content
    if (this._isActive) {
      c += chalk.bgWhiteBright(chalk.bold(chalk.cyan.underline(`[${this.orderKey}]`) + " " + chalk.black(this.name)));
    } else {
      c += chalk.cyan.underline(`[${this.orderKey}]`) + " " + this.name;
    }
    return c;
  }
  clear() {
    this.elLog.setContent("");
  }
  activate() {
    this._isActive = true;
    this.elLog.show();
    this.elLog.focus();
    this._render();
  }
  deactivate() {
    this._isActive = false;
    this.elLog.hide();
    this._render();
  }

  //#region 日志输出
  /**
   * 日志输出提供了极高的可拓展性
   * 1. 这里默认提供了一个强大的默认输出面板（logger），开发者可以自己修改这个面板的输出行为
   *    1. 可以自定义 write
   *    1. 可以自定义 clearLine
   *    1. 可以自定义 clearScreen
   *    1. 可以自定义 logger 的生成
   * 1. 但也可以扩展自己的输出面板，最终再将两个面板混合起来输出
   *    1. 重写 $renderLog 来定义最终的输出内容
   *    1. 使用 $queueRenderLog 来调度输出指令
   */

  protected $logAllContent = "";
  protected $logLastContent = "";
  write(s: string) {
    this.$logAllContent += this.$logLastContent = s;
    this.$queueRenderLog();
  }
  clearLine() {
    if (this.$logLastContent.length === 0) {
      return;
    }
    this.$logAllContent = this.$logAllContent.slice(0, -this.$logLastContent.length);
    this.$logLastContent = "";
    this.$logAllContent;
  }
  clearScreen() {
    this.$logLastContent = "";
    this.$logAllContent = "";
    this.$queueRenderLog();
  }

  private _rendering = false;
  protected $queueRenderLog() {
    if (this._rendering) {
      return;
    }
    this._rendering = true;
    queueMicrotask(() => {
      this._rendering = false;
      this.$renderLog();
    });
  }
  protected $renderLog() {
    this.elLog.setContent(this.$logAllContent);
  }

  private $getLoggerWriter() {
    return this.write.bind(this);
  }
  private $getLoggerClearScreen() {
    return this.clearScreen.bind(this);
  }
  private $getLoggerClearLine() {
    return this.clearLine.bind(this);
  }
  private _logger?: PKGM.Logger;
  get logger() {
    if (this._logger === undefined) {
      const writer = this.$getLoggerWriter();
      this._logger = createSuperLogger({
        prefix: "",
        infoPrefix: "i",
        warnPrefix: "⚠",
        errorPrefix: "X",
        successPrefix: "✓",
        stdoutWriter: writer,
        stderrWriter: writer,
        clearScreen: this.$getLoggerClearScreen(),
        clearLine: this.$getLoggerClearLine(),
      });
    }
    return this._logger;
  }
  //#endregion
}
export type StatusChangeCallback = (s: PanelStatus, ctx: BFSP.TUI.Panel) => void;
export type PanelStatus = "success" | "error" | "warn" | "loading" | "info";
