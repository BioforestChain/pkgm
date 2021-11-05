import type { Widgets } from "blessed";
import chalk from "chalk";
import type { RollupError } from "rollup";
import type { LogErrorOptions, Logger, LoggerOptions, LogLevel, LogType } from "vite";
import { require } from "./toolkit";
const blessed = require("blessed") as typeof import("blessed");

export const LogLevels: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
};
const screen = blessed.screen({
  smartCSR: true,
  useBCE: true,
  debug: true,
  sendFocus: true,
  terminal: chalk.supportsColor && chalk.supportsColor.has256 ? "xterm-256color" : "xterm",
  fullUnicode: true,
  title: "bfsp - powered by @bfchain/pkgm",
});
screen.render();

export function destroyScreen() {
  screen.destroy();
}

class ScrollableLog {
  readonly box: Widgets.BoxElement;
  constructor(options: Widgets.BoxOptions = {}) {
    const box = blessed.log({
      ...options,

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
          fg: options.style?.focus?.border?.fg ?? options.style?.border?.fg ?? "cyan",
        },
      },
    });
    this.box = box;
    box.focus();
    // let _userScrolled = false;
    // box.on("set content", () => {
    //   if (!_userScrolled /* || self.scrollOnInput */) {
    //     setImmediate(function () {
    //       box.setScrollPerc(100);
    //       _userScrolled = false;
    //       box.screen.render();
    //     });
    //   }
    // });
    // const _scroll = box.scroll;
    // box.scroll = (offset, always) => {
    //   if (offset === 0) {
    //     return _scroll.call(box, offset, always);
    //   }

    //   _userScrolled = true;
    //   const ret = _scroll.call(box, offset, always);
    //   if (box.getScrollPerc() === 100) {
    //     _userScrolled = false;
    //   }
    //   return ret;
    // };

    // this.box.shiftLine()
  }
  //   scroll (offset, always) {
  //     if (offset === 0) return this.box._scroll(offset, always);
  //     this._userScrolled = true;
  //     var ret = this._scroll(offset, always);
  //     if (this.getScrollPerc() === 100) {
  //       this._userScrolled = false;
  //     }
  //     return ret;
  //   };
  appendToScreen(screen: Widgets.Screen) {
    screen.append(this.box);
  }
}

export function createDevTui() {
  const viteLog = new ScrollableLog({
    top: "60%",
    left: "left",
    width: "100%",
    height: "40%",
    content: "" + chalk.cyanBright("starting..."),
    tags: true,
    border: {
      type: "line",
    },
    label: `${chalk.cyan.underline(`[0]`)} ${chalk.bold("Bundle")} `, // " {bold}Bundle{/bold} ",
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
  });
  screen.key(["0"], () => {
    viteLog.box.focus();
  });

  viteLog.appendToScreen(screen);

  function createViteLogger(level: LogLevel = "info", options: LoggerOptions = {}): Logger {
    const box = viteLog.box;
    const loggedErrors = new WeakSet<Error | RollupError>();
    const { allowClearScreen = true } = options;
    const thresh = LogLevels[level];
    const clear = allowClearScreen
      ? () => {
          box.setContent((boxContent = ""));
          screen.render();
        }
      : () => {};

    let lastType: LogType | undefined;
    let lastMsg: string | undefined;
    let sameCount = 0;

    let lastContent = "";
    let boxContent = "";

    let isInited = false;

    const buildStartMsg = chalk.cyanBright(`\nbuild started...`);

    function output(type: LogType, msg: string, options: LogErrorOptions = {}) {
      if (!isInited) {
        if (msg.includes("vite")) {
          const blankMsg = msg.replace(
            /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
            ""
          );
          const viteVersion = blankMsg.match(/vite v[\d\.]+/);
          if (viteVersion) {
            isInited = true;
            screen.debug(msg);
            return;
          }
        }
      }
      if (msg === buildStartMsg) {
        clear();
      }

      if (thresh >= LogLevels[type]) {
        const format = () => {
          if (options.timestamp) {
            const tag =
              type === "info"
                ? chalk.cyan.bold("ℹ️")
                : type === "warn"
                ? chalk.yellow.bold("⚠️")
                : chalk.red.bold("🚨");
            return `${chalk.dim(new Date().toLocaleTimeString())} ${tag} ${msg}`;
          } else {
            return msg;
          }
        };

        // screen.debug(msg);
        // console.log(JSON.stringify(msg));
        if (options.error) {
          loggedErrors.add(options.error);
        }
        if (type === lastType && msg === lastMsg) {
          sameCount++;
          clear();
          boxContent =
            boxContent.slice(0, -lastContent.length) +
            (lastContent = format() + ` ${chalk.yellow(`(x${sameCount + 1})`)}\n`);
          box.setContent(boxContent);
        } else {
          sameCount = 0;
          lastMsg = msg;
          lastType = type;
          if (options.clear) {
            clear();
          }
          boxContent = boxContent + (lastContent = format() + `\n`);
          box.setContent(boxContent);
        }
        screen.render();
      }
    }

    const warnedMessages = new Set<string>();

    const logger: Logger = {
      hasWarned: false,
      info(msg, opts) {
        output("info", msg, opts);
      },
      warn(msg, opts) {
        logger.hasWarned = true;
        output("warn", msg, opts);
      },
      warnOnce(msg, opts) {
        if (warnedMessages.has(msg)) return;
        logger.hasWarned = true;
        output("warn", msg, opts);
        warnedMessages.add(msg);
      },
      error(msg, opts) {
        logger.hasWarned = true;
        output("error", msg, opts);
      },
      clearScreen(type) {
        if (thresh >= LogLevels[type]) {
          clear();
        }
      },
      hasErrorLogged(error) {
        return loggedErrors.has(error);
      },
    };

    return logger;
  }

  const tscLog = new (class TscLog extends ScrollableLog {
    constructor(options?: Widgets.BoxOptions) {
      super(options);
    }

    readonly logo = blessed.text({ top: 0, left: 6, content: " ".repeat(5), style: { bg: "blue", fg: "blue" } });

    private _TSLOGO = `${chalk.cyan.underline(`[1]`)} ${chalk.bgBlue.white.bold("  TS ")}`;

    setLabel(label: string) {
      this.logo.setContent(".".repeat(5));
      process.nextTick(() => {
        this.logo.setContent(" ".repeat(5));
        this.box.screen.render();
      });
      this.box.setLabel(`${this._TSLOGO} ${label} `);
      this.box.screen.render();
    }
    appendToScreen(screen: Widgets.Screen) {
      screen.append(this.logo);
      super.appendToScreen(screen);
    }
    private _content = "";
    pushLine(line: string) {
      this.box.setContent((this._content += " " + line));
      this.box.screen.render();
    }
    clearScreen() {
      this.box.setContent((this._content = "\n"));
      this.box.screen.render();
    }
  })({
    top: 1,
    left: "left",
    width: "100%",
    height: "60%-1",
    content: "" + chalk.cyanBright("starting..."),
    tags: true,
    /// 这边使用bg模式，是为了确保链接能点击到
    border: { type: "bg" }, // { type: "bg" /* ch:  '　' */ },
    label: " {bold}Tsc Builder{/bold} ",
    style: {
      border: {
        fg: "gray",
        bg: "gray",
      },
      focus: {
        border: {
          fg: "cyan",
          bg: "cyan",
        },
      },
    },
  });

  screen.key(["1"], () => {
    tscLog.box.focus();
  });

  tscLog.appendToScreen(screen);

  const tscStateHelper = (() => {
    const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    let frameId = 0;
    const getLoadingFrames = () => FRAMES[frameId++ % FRAMES.length];
    let buildingTi: any;
    const startBuilding = () => {
      if (buildingTi !== undefined) {
        return;
      }
      tscLog.setLabel(getLoadingFrames());
      buildingTi = setInterval(() => {
        tscLog.setLabel(getLoadingFrames());
      }, 80);
    };
    const stopBuilding = () => {
      if (buildingTi === undefined) {
        return;
      }
      clearInterval(buildingTi);
      buildingTi = undefined;
    };

    return { startBuilding, stopBuilding };
  })();

  function createTscLogger() {
    // const box = tscLog.box;

    tscStateHelper.startBuilding();
    const autoUpdateLabel = (opts: { errorCount: number }) => {
      tscLog.setLabel(
        opts.errorCount === 0 ? chalk.red.greenBright("SUCCESS") : chalk.red.bold(`[${opts.errorCount}] ERROR`)
      );
    };

    return {
      write(s: string) {
        tscLog.pushLine(s);
        const foundErrors = s.match(/Found (\d+) error/);
        if (foundErrors !== null) {
          tscStateHelper.stopBuilding();
          const errorCount = parseInt(foundErrors[1]);

          autoUpdateLabel({ errorCount });
        } else {
          tscStateHelper.startBuilding();
        }
      },
      clear() {
        tscLog.clearScreen();
      },
      stop() {
        tscStateHelper.stopBuilding();
      },
      updateLabel: autoUpdateLabel,
    };
  }

  return {
    createViteLogger,
    createTscLogger,
  };
}

// import D from "debug";
const D = require("debug") as typeof import("debug");
import util from "node:util";

export function Debug(label: string) {
  const d = D(label);
  let t = Date.now();

  return Object.assign(
    (...args: unknown[]) => {
      if (!d.enabled) {
        return;
      }
      const now = Date.now();
      d.diff = now - t;
      t = now;

      args = [util.format(...args)];
      D.formatArgs.call(d, args);
      screen.debug(...(args as any));
    },
    { enabled: d.enabled }
  );
}

export function Warn(label: string) {
  const d = D(label);
  let t = Date.now();
  return Object.assign(
    (...args: unknown[]) => {
      if (!d.enabled) {
        return;
      }
      const now = Date.now();
      d.diff = now - t;
      t = now;

      args = [chalk.yellow(util.format(...args))];
      D.formatArgs.call(d, args);
      screen.debug(...(args as any));
    },
    { enabled: true }
  );
}

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

screen.key([/* "escape", "q",  */ "C-c"], function (ch, key) {
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
