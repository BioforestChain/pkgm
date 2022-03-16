import { chalk } from "@bfchain/pkgm-base/lib/chalk";
import type { RollupError } from "@bfchain/pkgm-base/lib/rollup";
import type { LogErrorOptions, LogLevel, LogType } from "@bfchain/pkgm-base/lib/vite";
import { LogLevels } from "./const";
import { Panel } from "./Panel";

export class TscPanel extends Panel<"Tsc"> {
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
export class BundlePanel extends Panel<"Bundle"> {
  private _loggedErrors = new WeakSet<Error | RollupError>();
  private _lastType: LogType | undefined;
  private _lastMsg: string | undefined;
  private _sameCount = 0;
  private _lastContent = "";
  private _boxContent = "";
  private _isInited?: string;
  private _thresh = LogLevels.info;

  setLevel(l: LogLevel) {
    this._thresh = LogLevels[l];
  }
  hasErrorLogged(error: Error | RollupError) {
    return this._loggedErrors.has(error);
  }
  write(type: LogType, text: string, options: LogErrorOptions = {}) {
    if (this._isInited === undefined) {
      if (text.includes("vite")) {
        const blankMsg = text.replace(
          /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
          ""
        );
        const viteVersion = blankMsg.match(/^vite v[\d\.]+/);
        if (viteVersion) {
          this._isInited = text;
          this._ctx.debug(text);
          return;
        }
      }
    } else if (this._isInited === text) {
      return;
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
      } else {
        this._sameCount = 0;
        this._lastMsg = text;
        this._lastType = type;
        if (options.clear) {
          this.clear();
        }
        this._boxContent = this._boxContent + (this._lastContent = format() + `\n`);
        this.elLog.setContent(this._boxContent);
      }
      if (type !== "info") {
        this.updateStatus(type);
      }
    }
  }
}
export class DepsPanel extends Panel<"Deps"> {
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
