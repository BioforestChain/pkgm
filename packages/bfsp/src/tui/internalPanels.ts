import { chalk } from "@bfchain/pkgm-base/lib/chalk";
import type { RollupError } from "@bfchain/pkgm-base/lib/rollup";
import type { LogErrorOptions, LogLevel, LogType } from "@bfchain/pkgm-base/lib/vite";
import { createSuperLogger } from "../SuperLogger";
import { LogLevels } from "./const";
import { Panel } from "./Panel";

export class TscPanel extends Panel<"Tsc"> {
  protected $tscLogAllContent = "";
  writeTscLog(text: string) {
    this.$tscLogAllContent += text;

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
    this.$queueRenderLog();
  }
  clearTscLog() {
    this.$tscLogAllContent = "";
    this.$queueRenderLog();
  }
  protected override $renderLog() {
    this.elLog.setContent(this.$tscLogAllContent + this.$logAllContent);
  }
}
export class BundlePanel<N extends string = string> extends Panel<N> {
  private _loggedErrors = new WeakSet<Error | RollupError>();
  private _viteLastMsgType: LogType | undefined;
  private _viteLastMsg: string | undefined;
  private _viteSameCount = 0;
  private _viteLastContent = "";
  private _viteAllContent = "";
  private _viteLogoContent?: string;
  private _thresh = LogLevels.info; // 默认打印所有的日志等级

  setLevel(l: LogLevel) {
    this._thresh = LogLevels[l];
  }
  hasErrorLogged(error: Error | RollupError) {
    return this._loggedErrors.has(error);
  }
  private _formatViteMsg = (type: LogType, msg: string, options: LogErrorOptions) => {
    if (options.timestamp) {
      return `${chalk.dim(new Date().toLocaleTimeString())} ${msg}`;
    } else {
      return msg;
    }
  };
  writeViteLog(type: LogType, msg: string, options: LogErrorOptions = {}) {
    /// 移除 logo
    if (this._viteLogoContent === undefined) {
      if (msg.includes("vite")) {
        const blankMsg = msg.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "");
        const viteVersion = blankMsg.match(/^vite v[\d\.]+/);
        if (viteVersion) {
          this._viteLogoContent = msg;
          this._ctx.debug(msg);
          return;
        }
      }
    } else if (this._viteLogoContent === msg) {
      return;
    }

    if (this._thresh >= LogLevels[type]) {
      if (options.error) {
        this._loggedErrors.add(options.error);
      }

      if (options.clear && type === this._viteLastMsgType && msg === this._viteLastMsg) {
        this._viteSameCount++;
        this._viteAllContent =
          this._viteAllContent.slice(0, -this._viteLastContent.length) +
          (this._viteLastContent =
            this._formatViteMsg(type, msg, options) + ` ${chalk.yellow(`(x${this._viteSameCount + 1})`)}\n`);
      } else {
        this._viteSameCount = 0;
        this._viteLastMsg = msg;
        this._viteLastMsgType = type;
        this._viteAllContent =
          this._viteAllContent + (this._viteLastContent = this._formatViteMsg(type, msg, options) + `\n`);
      }
      this.$queueRenderLog();

      /**
       * @TODO 这里需要修改updateStatus的行为，应该改成 addStatus(flag,type) 。从而允许多个实例同时操作这个status
       */
      if (type !== "info") {
        this.updateStatus(type);
      }
    }
  }
  clearViteLogScreen() {
    this._viteAllContent = "";
    this._viteLastContent = "";
    this._viteLastMsg = undefined;
    this._viteLastMsgType = undefined;
    this._viteSameCount = 0;
    this.$queueRenderLog();
  }
  clearViteLogLine() {
    this._viteAllContent = this._viteAllContent.slice(0, -this._viteLastContent.length);
    this._viteLastContent = "";
    this._viteLastMsg = undefined;
    this._viteLastMsgType = undefined;
    this._viteSameCount = 0;
    this.$queueRenderLog();
  }
  private _viteLogger?: PKGM.Logger;
  get viteLogger() {
    if (this._viteLogger === undefined) {
      this._viteLogger = createSuperLogger({
        prefix: "",
        infoPrefix: "i",
        warnPrefix: "⚠",
        errorPrefix: "X",
        successPrefix: "✓",
        stdoutWriter: (s) => this.writeViteLog("info", s),
        stderrWriter: (s) => this.writeViteLog("error", s),
        stdwarnWriter: (s) => this.writeViteLog("warn", s),
        clearScreen: this.clearViteLogScreen.bind(this),
        clearLine: this.clearViteLogLine.bind(this),
      });
    }
    return this._viteLogger;
  }

  protected override $renderLog(): void {
    this.elLog.setContent(this._viteAllContent + this.$logAllContent);
  }
}
export class DevPanel extends BundlePanel<"Dev"> {}
export class BuildPanel extends BundlePanel<"Build"> {}
export class WorkspacesPanel extends BundlePanel<"Workspaces"> {}
export class DepsPanel extends Panel<"Deps"> {
  private _depsAllContent = "";
  private _depsLastContent = "";
  writeDepsLog(s: string) {
    this._depsAllContent += this._depsLastContent = s;
    this.$queueRenderLog();
  }
  clearDepsLogLine() {
    if (this._depsLastContent.length === 0) {
      return;
    }
    this._depsAllContent = this._depsAllContent.slice(0, -this._depsLastContent.length);
    this._depsLastContent = "";
    this._depsAllContent;
  }
  clearDepsLogScreen() {
    this._depsLastContent = "";
    this._depsAllContent = "";
    this.$queueRenderLog();
  }

  private _depsLogger?: PKGM.Logger;
  get depsLogger() {
    if (this._depsLogger === undefined) {
      this._depsLogger = createSuperLogger({
        prefix: "",
        infoPrefix: "i",
        warnPrefix: "⚠",
        errorPrefix: "X",
        successPrefix: "✓",
        stdoutWriter: (s) => this.writeDepsLog(s),
        stderrWriter: (s) => this.writeDepsLog(s),
        clearScreen: this.clearDepsLogLine.bind(this),
        clearLine: this.clearDepsLogScreen.bind(this),
      });
    }
    return this._depsLogger;
  }

  protected override $renderLog(): void {
    this.elLog.setContent(this._depsAllContent + this.$logAllContent);
  }
}
