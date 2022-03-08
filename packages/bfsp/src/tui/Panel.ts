import chalk from "chalk";
import blessed, { Widgets } from "blessed";
import { afm } from "./animtion";
import { FRAMES, getBaseWidgetOptions, H_LOG, H_NAV, W_MAIN } from "./const";

export interface PanelContext {
  debug(log: string): void;
}
export abstract class Panel<N extends string, K extends number = number> implements BFSP.TUI.Panel<N, K> {
  constructor(protected _ctx: PanelContext, readonly key: K, readonly name: N) {
    this.deactivate();
    this.updateStatus(this._status);
  }
  private _status: PanelStatus = "loading";
  private _loadingFrameId = 0;
  private _isActive = true;
  readonly elLog = blessed.log(logWidgetOptions);
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
  private _render() {
    if (this._status === "loading") {
      this._loadingFrameId++;
      afm.requestAnimationFrame(() => this._render());
    } else {
      this._loadingFrameId = 0;
      afm.requestAnimationFrame(() => {});
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
      c += chalk.bgWhiteBright(chalk.bold(chalk.cyan.underline(`[${this.key}]`) + " " + chalk.black(this.name)));
    } else {
      c += chalk.cyan.underline(`[${this.key}]`) + " " + this.name;
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
}
export type StatusChangeCallback = (s: PanelStatus, ctx: BFSP.TUI.Panel) => void;
export type PanelStatus = "success" | "error" | "warn" | "loading" | "info";
const logWidgetOptions: Widgets.BoxOptions = {
  ...getBaseWidgetOptions(),
  top: 2 * H_NAV,
  width: W_MAIN,
  height: H_LOG,
  keys: true,
  vi: true,
  mouse: true,
  scrollable: true,
  draggable: true,
  alwaysScroll: true,
  scrollbar: {
    ch: " ",
    track: {
      inverse: true,
    },
    style: {
      inverse: true,
      fg: "cyan",
    },
  },
};
