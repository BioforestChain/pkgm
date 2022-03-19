import { chalk } from "@bfchain/pkgm-base/lib/chalk";
import { debug as D } from "@bfchain/pkgm-base/lib/debug";
import { defineViteStdoutApis, Logger, LoggerOptions, LogLevel } from "@bfchain/pkgm-base/lib/vite";
import util from "node:util";
import type { RollupError } from "rollup";
import { consoleLogger } from "./consoleLogger";
import { getTui, PanelStatus } from "./tui/index";

export const LogLevels: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
};
const useScreen = true;

let createViteLogger = (level: LogLevel = "info", options: LoggerOptions = {}) => {
  const warnedMessages = new Set<unknown>();

  const bundlePanel = getTui().getPanel("Bundle");
  const msgStringify = (msg: unknown) => {
    if (typeof msg === "string") {
      return msg;
    }
    return util.inspect(msg, { colors: true });
  };
  const logger: Logger = {
    hasWarned: false,
    info(msg, opts) {
      bundlePanel.writeViteLog("info", msgStringify(msg), opts);
    },
    warn(msg, opts) {
      logger.hasWarned = true;
      bundlePanel.writeViteLog("warn", msgStringify(msg), opts);
    },
    warnOnce(msg, opts) {
      if (warnedMessages.has(msg)) return;
      logger.hasWarned = true;
      bundlePanel.writeViteLog("warn", msgStringify(msg), opts);
      warnedMessages.add(msg);
    },
    error(msg, opts) {
      logger.hasWarned = true;
      bundlePanel.writeViteLog("error", msgStringify(msg), opts);
    },
    clearScreen() {
      bundlePanel.clear();
    },
    hasErrorLogged(error) {
      return bundlePanel.hasErrorLogged(error);
    },
  };

  return Object.assign(logger, {
    logger: bundlePanel.logger,
  });
};

export type $TscLogger = {
  write: (s: string) => void;
  clear: () => void;
};
let createTscLogger = (): $TscLogger => {
  const tscPanel = getTui().getPanel("Tsc");
  return tscPanel;
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
  createViteLogger = (level: LogLevel = "info", options: LoggerOptions = {}) => {
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
} else {
  const getViteStdoutApis = () => {
    const bundlePanel = getTui().getPanel("Bundle");
    const writeLine = bundlePanel.logger.log.line;
    const clearLine = bundlePanel.logger.clearLine;
    return { writeLine, clearLine };
  };
  defineViteStdoutApis({
    writeLine: (log) => {
      const apis = getViteStdoutApis();
      defineViteStdoutApis(apis);
      return apis.writeLine(log);
    },
    clearLine: () => {
      const apis = getViteStdoutApis();
      defineViteStdoutApis(apis);
      return apis.clearLine;
    },
  });
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
      if (!useScreen) {
        console.log(...args);
      } else {
        getTui().debug(...args);
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
