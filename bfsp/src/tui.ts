import chalk from "chalk";
import blessed, { Widgets } from "blessed";
import type { RollupError } from "rollup";
import type { LogErrorOptions, Logger, LoggerOptions, LogLevel, LogType } from "vite";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
export type PanelStatus = "success" | "error" | "warn" | "loading" | "info";
abstract class Panel {
  private _status: PanelStatus = "loading";
  private _statusChangeCb?: (s: PanelStatus) => void;
  private _loadingFrameId = 0;
  private _isActive = true;
  abstract name: string;
  readonly elLog = blessed.log(getLogOptions());
  readonly elMenu = blessed.box({});
  readonly key!: number;
  onStatusChange(cb: (newStatus: PanelStatus) => void) {
    this._statusChangeCb = cb;
  }
  updateStatus(s: PanelStatus) {
    this._status = s;
    this._statusChangeCb?.(s);
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
  nextLoadingFrame() {
    this._loadingFrameId++;
    this.elMenu.content = this._buildMenuContent();
  }
  clear() {
    this.elLog.setContent("");
  }
  activate() {
    this._isActive = true;
    this.elMenu.content = this._buildMenuContent();
    this.elLog.show();
    this.elLog.focus();
  }
  deactivate() {
    this._isActive = false;
    this.elMenu.content = this._buildMenuContent();
    this.elLog.hide();
  }
  constructor(key: number) {
    this.key = key;
    this.deactivate();
  }
}

const getLogOptions = (options: Widgets.BoxOptions = {}) => {
  return {
    ...options,
    top: "10%",
    left: "left",
    width: "70%",
    height: "80%",
    keys: true,
    vi: true,
    mouse: true,

    tags: true,
    border: {
      type: "line",
    },
    // label: `${chalk.cyan.underline(`[0]`)} ${chalk.bold("Bundle")} `, // " {bold}Bundle{/bold} ",
    style: {
      border: {
        fg: "gray",
      },
      focus: {
        border: {
          fg: "cyan",
        },
      },
    },

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
        fg: options.style?.focus?.border?.fg ?? options.style?.border?.fg ?? "cyan",
      },
    },
  } as Widgets.BoxOptions;
};

const LogLevels: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
};

export class TscPanel extends Panel {
  name: string = "Tsc";
  write(text: string) {
    this.elLog.log(text);
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
export class BundlePanel extends Panel {
  private _loggedErrors = new WeakSet<Error | RollupError>();
  private _lastType: LogType | undefined;
  private _lastMsg: string | undefined;
  private _sameCount = 0;
  private _lastContent = "";
  private _boxContent = "";
  private _isInited = false;
  private _buildStartMsg = chalk.cyanBright(`\nbuild started...`);
  private _thresh = LogLevels.info;
  name: string = "Bundle";

  setLevel(l: LogLevel) {
    this._thresh = LogLevels[l];
  }
  hasErrorLogged(error: Error | RollupError) {
    return this._loggedErrors.has(error);
  }
  write(type: LogType, text: string, options: LogErrorOptions = {}) {
    if (!this._isInited) {
      if (text.includes("vite")) {
        const blankMsg = text.replace(
          /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
          ""
        );
        const viteVersion = blankMsg.match(/vite v[\d\.]+/);
        if (viteVersion) {
          this._isInited = true;
          tui.debug(text);
          return;
        }
      }
    }
    if (text === this._buildStartMsg) {
      this.clear();
    }
    if (this._thresh >= LogLevels[type]) {
      const format = () => {
        if (options.timestamp) {
          const tag =
            type === "info" ? chalk.cyan.bold("ℹ️") : type === "warn" ? chalk.yellow.bold("⚠️") : chalk.red.bold("🚨");
          return `${chalk.dim(new Date().toLocaleTimeString())} ${tag} ${text}`;
        } else {
          return text;
        }
      };
      if (options.error) {
        this._loggedErrors.add(options.error);
      }

      if (type === this._lastType && text === this._lastMsg) {
        this._sameCount++;
        this.clear();
        this._boxContent =
          this._boxContent.slice(0, -this._lastContent.length) +
          (this._lastContent = format() + ` ${chalk.yellow(`(x${this._sameCount + 1})`)}\n`);
        this.elLog.setContent(this._boxContent);
        this.updateStatus(type);
      } else {
        this._sameCount = 0;
        this._lastMsg = text;
        this._lastType = type;
        if (options.clear) {
          this.clear();
        }
        this._boxContent = this._boxContent + (this._lastContent = format() + `\n`);
        this.elLog.setContent(this._boxContent);
        this.updateStatus(type);
      }
    }
  }
}

class Tui {
  private _currentKey: number = -1;
  private _loadingTi?: NodeJS.Timeout;
  private _panels: Map<string, Panel> = new Map();
  private _screen!: Widgets.Screen;
  constructor() {
    this._screen = blessed.screen({
      smartCSR: true,
      useBCE: true,
      debug: true,
      sendFocus: true,
      terminal: chalk.supportsColor && chalk.supportsColor.has256 ? "xterm-256color" : "xterm",
      fullUnicode: true,
      title: "bfsp - powered by @bfchain/pkgm",
    });
    this._initControls();
    this._startLoading();
    this._screen.render();

    // setTimeout(() => {
    //   const p = this.getPanel("Tsc")!;
    //   p.clear();
    // }, 1000);
    const screen = this._screen;
    queueMicrotask(() => {
      //// 关闭进程的交互

      let asking = false;
      let dangerQuestion: Widgets.QuestionElement | undefined;
      function initDangerQuestion() {
        const dangerQuestion = blessed.question({
          parent: screen,
          border: "line",
          height: "shrink",
          width: "half",
          top: "center",
          left: "center",
          label: " {red-fg}WARNING{/red-fg} ",
          style: { border: { fg: "yellow" } },
          tags: true,
          keys: true,
          vi: true,
        });
        dangerQuestion._.okay.content = `${chalk.underline("Y")}es`;
        dangerQuestion._.cancel.content = `${chalk.underline("N")}o`;
        return dangerQuestion;
      }

      screen!.key([/* "escape", "q",  */ "C-c"], function (ch, key) {
        dangerQuestion ??= initDangerQuestion();

        if (asking) {
          return process.exit(0);
        }
        asking = true;
        dangerQuestion.ask("confirm to exit?", (err, confirmed) => {
          asking = false;
          if (confirmed) {
            return process.exit(0);
          }
        });
      });
    });
  }

  getPanel(name: "Tsc" | "Bundle") {
    return this._panels.get(name);
  }
  destory() {
    this._screen.destroy();
  }
  debug(...args: unknown[]) {
    this._screen.debug(...(args as any));
  }
  private _initControls() {
    const tsc = new TscPanel(0);
    this._panels.set(tsc.name, tsc);

    const bundle = new BundlePanel(1);
    this._panels.set(bundle.name, bundle);

    const sorted = [...this._panels.values()];
    sorted.sort((a, b) => a.key - b.key); // 这样导航项就是升序

    const nav = blessed.box({
      top: "0%",
      height: "10%",
      width: "70%",
    });

    this._screen.append(nav);
    const unitWidth = Math.round(70 / sorted.length);
    sorted.forEach((p, i) => {
      // 菜单项样式
      p.elMenu.top = 0;
      p.elMenu.width = `${unitWidth}%`;
      p.elMenu.left = i * unitWidth;
      nav.append(p.elMenu);
      this._screen.append(p.elLog);
      // 按键导航
      this._screen.key(`${i}`, (ch, key) => {
        if (i === this._currentKey) {
          return;
        }
        this._currentKey = i;
        this._updateSelected();
      });
    });
    // 左右导航
    this._screen.key(["left", "right"], (ch, key) => {
      if (key.name === "left") {
        this._currentKey--;
        if (this._currentKey < 0) {
          this._currentKey = this._panels.size - 1;
        }
      } else if (key.name === "right") {
        this._currentKey++;
        if (this._currentKey >= this._panels.size) {
          this._currentKey = 0;
        }
      }
      this._updateSelected();
    });
    this._currentKey = 0;
    this._updateSelected();
  }

  private _startLoading() {
    const panels = [...this._panels.values()];
    if (!this._loadingTi) {
      this._loadingTi = setInterval(() => {
        panels.forEach((p) => p.nextLoadingFrame());
        this._screen.render();
      }, 80);
    }
  }
  private _updateSelected() {
    this._panels.forEach((x) => {
      x.deactivate();
      if (x.key === this._currentKey) {
        x.activate();
      }
    });
    this._screen.render();
  }
}
export const tui = new Tui();

// 以下代码用于测试面板是否能正常输出
// 实际运行中，面板经常性闪烁/显示不完整。
// 但只跑这段代码输出时是正常的，因此怀疑可能是vite输出了清屏的ansi指令
import crypto from "node:crypto";
export const testTui = () => {
  const tsc = tui.getPanel("Tsc") as TscPanel;
  const vite = tui.getPanel("Bundle") as BundlePanel;
  vite.write("info", "vite v2.7.1 start building");
  const randMsg = () => {
    const errCount = Math.round(Math.random() * 10) % 2;
    const tsmsg = `Found ${errCount} errors`;
    if (Math.random() > 0.5) {
      if (Math.random() > 0.5) {
        tsc.write(tsmsg);
      } else {
        tsc.write(crypto.randomBytes(6).toString("base64"));
      }
    } else {
      vite.write("info", crypto.randomBytes(6).toString("base64"));
    }
    setTimeout(() => {
      randMsg();
    }, 800);
  };
  randMsg();
  return;
};
