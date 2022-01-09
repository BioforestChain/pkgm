import chalk from "chalk";
import util from "node:util";
import type { RollupError } from "rollup";
import type { Logger, LoggerOptions, LogLevel } from "vite";
import { require } from "./toolkit";
import { PanelStatus, getTui } from "./tui/index";

export const LogLevels: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
};
const useScreen = true;
if (!useScreen) {
  console.log(`面板已被禁用，若要使用面板，请将 useScreen 设为true`);
}

export function createDevTui() {
  if (!useScreen) {
    return {
      createTscLogger: () => {
        return {
          write(s: string) {
            console.log(s);
          },
          clear() {},
          updateStatus(s: PanelStatus) {},
        };
      },
      createViteLogger: () => {
        const warnedMessages = new Set<string>();
        const loggedErrors = new WeakSet<Error | RollupError>();
        const logger: Logger = {
          hasWarned: false,
          info(msg, opts) {
            console.log(msg);
          },
          warn(msg, opts) {
            logger.hasWarned = true;
            console.log(msg);
          },
          warnOnce(msg, opts) {
            if (warnedMessages.has(msg)) return;
            logger.hasWarned = true;
            console.log(msg);
            warnedMessages.add(msg);
          },
          error(msg, opts) {
            logger.hasWarned = true;
            console.log(msg);
          },
          clearScreen(type) {},
          hasErrorLogged(error) {
            return loggedErrors.has(error);
          },
        };
        return logger;
      },
    };
  }

  function createViteLogger(level: LogLevel = "info", options: LoggerOptions = {}): Logger {
    const warnedMessages = new Set<string>();

    const bundlePanel = getTui().getPanel("Bundle");
    const logger: Logger = {
      hasWarned: false,
      info(msg, opts) {
        bundlePanel.write("info", msg, opts);
      },
      warn(msg, opts) {
        logger.hasWarned = true;
        bundlePanel.write("warn", msg, opts);
      },
      warnOnce(msg, opts) {
        if (warnedMessages.has(msg)) return;
        logger.hasWarned = true;
        bundlePanel.write("warn", msg, opts);
        warnedMessages.add(msg);
      },
      error(msg, opts) {
        logger.hasWarned = true;
        bundlePanel.write("error", msg, opts);
      },
      clearScreen(type) {
        bundlePanel.clear();
      },
      hasErrorLogged(error) {
        return bundlePanel.hasErrorLogged(error);
      },
    };

    return logger;
  }

  function createTscLogger() {
    const tscPanel = getTui().getPanel("Tsc");
    return tscPanel;
  }

  return {
    createViteLogger,
    createTscLogger,
  };
}

// import D from "debug";
const D = require("debug") as typeof import("debug");

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
      if (!useScreen) {
        console.log(...args);
      } else {
        getTui().debug(...(args as any));
      }
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
      if (!useScreen) {
        console.log(...args);
      } else {
        getTui().debug(...(args as any));
      }
    },
    { enabled: true }
  );
}
