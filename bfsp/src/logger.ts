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
  terminal: "xterm-256color",
  fullUnicode: true,
  title: "bfsp - power by @bfchain/pkgm",
});
screen.key([/* "escape", "q",  */ "C-c"], function (ch, key) {
  return process.exit(0);
});
screen.render();

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
}
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
  label: " {bold}Bundle{/bold} ",
  style: {
    border: {
      fg: "cyanBright",
    },
    focus: {
      border: {
        fg: "cyan",
      },
    },
  },
});

screen.append(viteLog.box);

export function createViteLogger(level: LogLevel = "info", options: LoggerOptions = {}): Logger {
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
        const blankMsg = msg.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "");
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
            type === "info" ? chalk.cyan.bold("ℹ️") : type === "warn" ? chalk.yellow.bold("⚠️") : chalk.red.bold("🚨");
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

const tscLog = new ScrollableLog({
  top: 1,
  left: "left",
  width: "100%",
  height: "60%-1",
  content: "" + chalk.cyanBright("starting..."),
  tags: true,
  /// 这边使用bg模式，是为了确保链接能点击到
  border: "bg", // { type: "bg" /* ch:  '　' */ },
  label: " {bold}Tsc Builder{/bold} ",
  style: {
    border: {
      fg: "blueBright",
      // bg: "blueBright",
    },
    focus: {
      border: {
        fg: "blue",
        // bg: "blue",
      },
    },
  },
});

screen.append(tscLog.box);

export function createTscLogger() {
  const box = tscLog.box;
  const TSLOGO = chalk.bgBlue.white.bold("TypeScript");
  const TIMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let timeId = 0;
  let building: any;
  const startBuilding = () => {
    if (building !== undefined) {
      return;
    }
    box.setLabel(buildingLabel());
    building = setInterval(() => {
      box.setLabel(buildingLabel());
    }, 80);
  };
  const stopBuilding = () => {
    if (building === undefined) {
      return;
    }
    clearInterval(building);
    building = undefined;
  };
  const buildingLabel = () => ` ${TSLOGO} ${TIMES[timeId++ % TIMES.length]} `;

  startBuilding();

  return {
    write(s: string) {
      box.pushLine(s);
      box.screen.render();
      const foundErrors = s.match(/Found (\d+) error/);
      if (foundErrors !== null) {
        stopBuilding();
        const errorCount = parseInt(foundErrors[1]);
        box.setLabel(
          ` ${TSLOGO} ${errorCount === 0 ? chalk.red.greenBright("SUCCESS") : `[${chalk.red.bold(errorCount)}]`} `
        );
      } else {
        startBuilding();
      }
    },
    clear() {
      box.setContent("");
      box.screen.render();
    },
  };
}

// import D from "debug";
const D = require("debug");
import util from "node:util";

export function debug(label: string) {
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
      // screen.debug(util.format(...args));
    },
    { enabled: false }
  );
}