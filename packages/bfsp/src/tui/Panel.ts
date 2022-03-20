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

  protected $elLogWrite(s: string) {
    this.elLog.setContent(this.elLog.getContent() + s);
  }

  protected $getLoggerWriter() {
    return (s: string) => this.$elLogWrite(s);
  }
  protected $getLoggerClearScreen() {
    return () => {};
  }
  protected $getLoggerClearLine() {
    return () => {};
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
}
export type StatusChangeCallback = (s: PanelStatus, ctx: BFSP.TUI.Panel) => void;
export type PanelStatus = "success" | "error" | "warn" | "loading" | "info";
