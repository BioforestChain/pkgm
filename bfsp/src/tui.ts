import chalk from "chalk";
import blessed, { Widgets } from "blessed";
import type { RollupError } from "rollup";
import type { LogErrorOptions, Logger, LoggerOptions, LogLevel, LogType } from "vite";

const H_NAV = 1;
const H_STATUSBAR = 3;
const H_LOG = `100%-${H_NAV + H_STATUSBAR}`;
const W_MAIN_N = 70;
const W_INFO_N = 30;
const W_MAIN = `${W_MAIN_N}%`;
const W_INFO = `${W_INFO_N}%`;

const getBaseWidgetOptions = () =>
  ({
    tags: true,
    border: {
      type: "line",
    },
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
  } as Widgets.BoxOptions);
const navWidgetOptions: Widgets.BoxOptions = {
  height: H_NAV,
  width: W_MAIN,
};
const logWidgetOptions: Widgets.BoxOptions = {
  ...getBaseWidgetOptions(),
  top: H_NAV,
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
const statusBarWidgetOptions: Widgets.BoxOptions = {
  ...getBaseWidgetOptions(),
  top: `100%-${H_STATUSBAR}`,
  height: H_STATUSBAR,
  width: W_MAIN,
};

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
export type PanelStatus = "success" | "error" | "warn" | "loading" | "info";

export interface PanelName {
  Tsc: 0;
  Bundle: 1;
  Deps: 2;
}
abstract class Panel {
  private _status: PanelStatus = "loading";
  private _statusChangeCb?: (s: PanelStatus) => void;
  private _loadingFrameId = 0;
  private _isActive = true;
  name!: keyof PanelName;
  readonly elLog = blessed.log(logWidgetOptions);
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
  constructor(key: number, name: keyof PanelName) {
    this.key = key;
    this.name = name;
    this.deactivate();
  }
}

const LogLevels: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
};

export class TscPanel extends Panel {
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
export class DepsPanel extends Panel {
  write(text: string) {
    this.elLog.log(text);
    if (/Visit https/.test(text)) {
      this.updateStatus("error");
    }
    if (/Done in (\d+\.\d+)/.test(text)) {
      this.updateStatus("success");
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

class StatusBar {
  private _el!: Widgets.BoxElement;
  private _currentMsg = "";
  private _nextMsgTi?: NodeJS.Timeout;
  private _loadingFrameId = 0;
  private _loadingEnabled = false;
  private _msgQ = [] as string[];
  constructor(el: Widgets.BoxElement) {
    this._el = el;
    this._nextMsgTi = setInterval(() => {
      this._nextMsg();
    }, 1000);
  }
  private _buildContent() {
    let c = "";
    if (this._loadingEnabled) {
      c += FRAMES[this._loadingFrameId % FRAMES.length];
    }
    c += " ".repeat(2);
    c += this._currentMsg;
    return c;
  }
  private _nextMsg() {
    if (this._msgQ.length > 0) {
      const msg = this._msgQ.shift();
      if (msg) {
        this._currentMsg = msg;
      }
    }
  }
  enableLoading() {
    this._loadingEnabled = true;
  }
  disableLoading() {
    this._loadingEnabled = false;
  }
  nextLoadingFrame() {
    this._loadingFrameId++;
    this._el.content = this._buildContent();
  }
  sendMsg(msg: string) {
    this._msgQ.unshift(msg); // 或者直接显示？
  }
  postMsg(msg: string) {
    this._msgQ.push(msg);
  }
}
class Tui {
  private _currentKey: number = -1;
  private _loadingTi?: NodeJS.Timeout;
  private _panels: Map<string, Panel> = new Map();
  private _screen!: Widgets.Screen;
  status!: StatusBar;
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

  getPanel(name: keyof PanelName) {
    return this._panels.get(name);
  }
  destory() {
    this._screen.destroy();
  }
  debug(...args: unknown[]) {
    this._screen.debug(...(args as any));
  }
  private _initControls() {
    const tsc = new TscPanel(0, "Tsc");
    this._panels.set(tsc.name, tsc);

    const bundle = new BundlePanel(1, "Bundle");
    this._panels.set(bundle.name, bundle);

    const deps = new DepsPanel(2, "Deps");
    this._panels.set(deps.name, deps);

    const sorted = [...this._panels.values()];
    sorted.sort((a, b) => a.key - b.key); // 这样导航项就是升序

    const nav = blessed.box(navWidgetOptions);

    this._screen.append(nav);
    const unitWidth = Math.round(W_MAIN_N / sorted.length);
    sorted.forEach((p, i) => {
      // 菜单项样式
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
    const statusBar = blessed.box(statusBarWidgetOptions);
    this._screen.append(statusBar);
    this.status = new StatusBar(statusBar);

    this._currentKey = 0;
    this._updateSelected();
  }

  private _startLoading() {
    const panels = [...this._panels.values()];
    if (!this._loadingTi) {
      this._loadingTi = setInterval(() => {
        panels.forEach((p) => p.nextLoadingFrame()); // 面板loading
        this.status.nextLoadingFrame(); // 状态栏loading
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
