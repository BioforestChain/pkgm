import { chalk } from "@bfchain/pkgm-base/lib/chalk";
import { debug as D } from "@bfchain/pkgm-base/lib/debug";
import type { Logger, LoggerOptions, LogLevel } from "@bfchain/pkgm-base/lib/vite";
import util from "node:util";
import type { RollupError } from "rollup";
import { getTui, PanelStatus } from "./tui/index";

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

export const { createTscLogger, createViteLogger } = createDevTui();

function createDevTui() {
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
        const warnedMessages = new Set<unknown>();
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
          clearScreen() {},
          hasErrorLogged(error) {
            return loggedErrors.has(error);
          },
        };
        return logger;
      },
    };
  }

  function createViteLogger(level: LogLevel = "info", options: LoggerOptions = {}): Logger {
    const warnedMessages = new Set<unknown>();

    const bundlePanel = getTui().getPanel("Bundle");
    const msgStringify = (msg: unknown) => {
      if (typeof msg === "string") {
        return msg;
      }
      debugger;
      return util.inspect(msg, { colors: true });
    };
    const logger: Logger = {
      hasWarned: false,
      info(msg, opts) {
        bundlePanel.write("info", msgStringify(msg), opts);
      },
      warn(msg, opts) {
        logger.hasWarned = true;
        bundlePanel.write("warn", msgStringify(msg), opts);
      },
      warnOnce(msg, opts) {
        if (warnedMessages.has(msg)) return;
        logger.hasWarned = true;
        bundlePanel.write("warn", msgStringify(msg), opts);
        warnedMessages.add(msg);
      },
      error(msg, opts) {
        logger.hasWarned = true;
        bundlePanel.write("error", msgStringify(msg), opts);
      },
      clearScreen() {
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
export type $Logger = ReturnType<typeof Debug>;

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
