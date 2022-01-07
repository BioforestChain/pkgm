import { PanelStatus, tui } from "./tui";
import type { BundlePanel, TscPanel } from "./tui";
import chalk from "chalk";
import type { RollupError } from "rollup";
import type { LogErrorOptions, Logger, LoggerOptions, LogLevel, LogType } from "vite";
import { require } from "./toolkit";

export const LogLevels: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
};
let useScreen = true;
if (!useScreen) {
  console.log(`面板已被禁用，若要使用面板，请将 useScreen 设为true`);
}

const bundlePanel = tui.getPanel("Bundle")! as BundlePanel;
const tscPanel = tui.getPanel("Tsc")! as TscPanel;
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
    return tscPanel;
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
      if (!useScreen) {
        console.log(...args);
      } else {
        tui.debug(...(args as any));
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
        tui.debug(...(args as any));
      }
    },
    { enabled: true }
  );
}
