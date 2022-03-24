import { chalk } from "@bfchain/pkgm-base/lib/chalk";
import { debug as D } from "@bfchain/pkgm-base/lib/debug";
import {
  defineViteStdoutApis,
  LogErrorOptions,
  Logger,
  LoggerOptions,
  LogLevel,
  LogType,
} from "@bfchain/pkgm-base/lib/vite";
import util from "node:util";
import type { RollupError } from "@bfchain/pkgm-base/lib/rollup";
import { consoleLogger } from "./consoleLogger";
import { $LoggerKit, getTui, hasTui } from "./tui/index";
import { BundlePanel } from "./tui/internalPanels";

export const LogLevels: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
};
const useScreen = true;

let _viteLogger: Logger | undefined;
let _viteLogoContent: string | undefined;
let createViteLogger = (viteLoggerKit: $LoggerKit, level: LogLevel = "info", options: LoggerOptions = {}) => {
  if (_viteLogger === undefined) {
    const warnedMessages = new Set<unknown>();

    const $formatViteMsg = (type: LogType, msg: string, options: LogErrorOptions) => {
      if (options.timestamp) {
        return `${chalk.dim(new Date().toLocaleTimeString())} ${msg}`;
      } else {
        return msg;
      }
    };
    const blankMsg = (msg: string) =>
      msg.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "");

    const $viteLogThresh = LogLevels[level];
    const $viteLoggedErrors = new WeakSet<Error | RollupError>();
    let $viteLastMsgType: LogType | undefined;
    let $viteLastMsg: string | undefined;
    let $viteSameCount = 0;

    const writeViteLog = (type: LogType, msg: string, options: LogErrorOptions = {}) => {
      /// 移除 logo
      if (_viteLogoContent === undefined) {
        if (msg.includes("vite")) {
          const viteVersion = blankMsg(msg).match(/^vite v[\d\.]+/);
          if (viteVersion) {
            _viteLogoContent = msg;
          }
        }
      }
      if (_viteLogoContent === msg) {
        viteLoggerKit.debug(msg);
        return;
      }

      if ($viteLogThresh < LogLevels[type]) {
        return;
      }

      if (options.error) {
        $viteLoggedErrors.add(options.error);
      }

      const piner = viteLoggerKit.logger.info;

      let print =
        type === "error"
          ? viteLoggerKit.logger.error
          : type === "warn"
          ? viteLoggerKit.logger.warn
          : viteLoggerKit.logger.info;
      if (print === viteLoggerKit.logger.info) {
        const bmsg = blankMsg(msg);
        debugger;
        if (bmsg.startsWith("✓")) {
          msg = bmsg.replace("✓", "").trimStart();
          print = viteLoggerKit.logger.success;
        } else if (bmsg.endsWith("...")) {
          piner.pin("ing", msg.trim());
          return;
        } else {
          piner.unpin("ing");
        }
      }

      if (options.clear && type === $viteLastMsgType && msg === $viteLastMsg) {
        $viteSameCount++;
        piner.pin("same", `\n ${chalk.yellow(`(x${$viteSameCount + 1})`)}`);
      } else {
        if ($viteSameCount !== 0) {
          print(` ${chalk.yellow(`(x${$viteSameCount + 1})`)}`);
          piner.unpin("same");

          $viteSameCount = 0;
          $viteLastMsg = msg;
          $viteLastMsgType = type;
        }
        print($formatViteMsg(type, msg, options));
      }

      /**
       * @TODO 这里需要修改updateStatus的行为，应该改成 addStatus(flag,type) 。从而允许多个实例同时操作这个status
       */
      if (type !== "info") {
        // this.updateStatus(type);
      }
    };

    const msgStringify = (msg: unknown) => {
      if (typeof msg === "string") {
        return msg;
      }
      return util.inspect(msg, { colors: true });
    };
    const logger: Logger = {
      hasWarned: false,
      info(msg, opts) {
        writeViteLog("info", msgStringify(msg), opts);
      },
      warn(msg, opts) {
        logger.hasWarned = true;
        writeViteLog("warn", msgStringify(msg), opts);
      },
      warnOnce(msg, opts) {
        if (warnedMessages.has(msg)) return;
        logger.hasWarned = true;
        writeViteLog("warn", msgStringify(msg), opts);
        warnedMessages.add(msg);
      },
      error(msg, opts) {
        logger.hasWarned = true;
        writeViteLog("error", msgStringify(msg), opts);
      },
      clearScreen() {
        $viteLastMsg = undefined;
        $viteLastMsgType = undefined;
        $viteSameCount = 0;
        viteLoggerKit.clearScreen();
      },
      hasErrorLogged(error) {
        return $viteLoggedErrors.has(error);
      },
    };

    _viteLogger = logger;

    defineViteStdoutApis({
      writeLine: (log: string) => viteLoggerKit.logger.log.pin("#line", log),
      clearLine: () => viteLoggerKit.logger.log.unpin("#line"),
    });
  }
  return _viteLogger;
};

export type $TscLogger = {
  write: (s: string) => void;
  clear: () => void;
};
let _tscLogger: $TscLogger | undefined;
let createTscLogger = () => {
  if (_tscLogger === undefined) {
    const tscPanel = getTui().getPanel("Tsc");
    _tscLogger = {
      write: tscPanel.writeTscLog.bind(tscPanel),
      clear: tscPanel.clearTscLog.bind(tscPanel),
    };
  }
  return _tscLogger;
};

if (!useScreen) {
  console.warn(`TUI面板已被禁用，使用日志模式！`);
  createTscLogger = () => {
    return {
      write(s: string) {
        console.log(s);
      },
      clear() {},
    };
  };
  createViteLogger = () => {
    const warnedMessages = new Set<unknown>();
    const loggedErrors = new WeakSet<Error | RollupError>();
    const viteLogger: Logger = {
      hasWarned: false,
      info(msg, opts) {
        console.log(msg);
      },
      warn(msg, opts) {
        viteLogger.hasWarned = true;
        console.log(msg);
      },
      warnOnce(msg, opts) {
        if (warnedMessages.has(msg)) return;
        viteLogger.hasWarned = true;
        console.log(msg);
        warnedMessages.add(msg);
      },
      error(msg, opts) {
        viteLogger.hasWarned = true;
        console.log(msg);
      },
      clearScreen() {},
      hasErrorLogged(error) {
        return loggedErrors.has(error);
      },
    };

    return Object.assign(viteLogger, { logger: consoleLogger });
  };
}
export { createTscLogger, createViteLogger };

function DebugFactory(level: "info" | "warn" | "error" = "info", label: string) {
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
      if (level === "warn") {
        args[0] = chalk.yellow(args[0]);
      } else if (level === "error") {
        args[0] = chalk.red(args[0]);
      }
      D.formatArgs.call(d, args);
      if (hasTui()) {
        getTui().debug(...args);
      } else {
        consoleLogger.log(...args);
      }
    },
    { enabled: level === "info" ? d.enabled : true }
  );
}
export const DevLogger = (label: string) => {
  return Object.assign(DebugFactory("info", label), {
    warn: DebugFactory("warn", label),
    error: DebugFactory("error", label),
  });
};
