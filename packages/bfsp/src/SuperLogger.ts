import { chalk } from "@bfchain/pkgm-base/lib/chalk";
import type { Readable } from "node:stream";
import util from "node:util";
import { afm } from "./tui/animtion";
import { FRAMES } from "./tui/const";

import { setTimeout as sleep } from "node:timers/promises";
type $Writer = (s: string) => void;
export const createSuperLogger = (options: {
  prefix: string;
  stdoutWriter: $Writer;
  stderrWriter: $Writer;

  stdinfoWriter?: $Writer;
  stdsuccWriter?: $Writer;
  stdwarnWriter?: $Writer;

  logPrefix?: string;
  infoPrefix?: string;
  warnPrefix?: string;
  errorPrefix?: string;
  successPrefix?: string;
  clearScreen?: () => void;
  clearLine?: (line: string) => void;
}) => {
  /**
   * 在 line  模式意思是：下一次打印从新的一行开始。
   * 而 write 模式的意思是：直接连续输出内容。
   * 在 write 模式下：
   *     1. 如果我们切换了模式，那么需要需要自行另起一行
   *     1. 如果没有切换模式，那么要注意不要在头部输出
   *
   * 所以 curLinePrefix 的作用是，判断 curLinePrefix 与目前要输出内容的 linePrefix 是否一致。
   * 1. 如果一致。那么不需要在头部加任何额外的输出。
   *    这适用于 write 模式，可以连续地在一个模式内的一行内，持续写入
   * 1. 如果不一致，那么久需要在头部加特定的输出
   *    line 模式，那么每次输出后的末尾加上 '\n' ，那么 curLinePrefix 也就变成了 ''。这跟当前行总是不一致，那么 linePrefix 就会被打印出来
   *    write 模式，那么每次输出后，curLinePrefix 的值就变成了 linePrefix。
   */
  let curLinePrefix: string | undefined;
  /**
   * 上一次打印是否是writeLine模式
   * 每一次print都会被重置状态成false
   * 是否有 pin📌 的内容
   * pin 是指将内容钉在底部
   */
  let pinContent = "";

  let groupPrefix = "";
  const Format = (linePrefix: string, lineMode: boolean) => {
    if (linePrefix.length > 0) {
      linePrefix += " ";
    }
    return (format?: any, ...param: any[]) => {
      let out: string = "";
      // 如果前缀改变了，那么强制换行
      if (linePrefix !== curLinePrefix) {
        out += linePrefix + groupPrefix;
        curLinePrefix = linePrefix;
      }

      out += util.format(format, ...param).replace(/\n/g, "\n" + linePrefix + groupPrefix);

      // 写入回车
      if (lineMode) {
        out += "\n";
        curLinePrefix = "";
      }

      return out;
    };
  };
  const Print = (linePrefix: string, writer: $Writer, lineMode: boolean) => {
    const formatter = Format(linePrefix, lineMode);
    return Object.assign(
      (format?: any, ...param: any[]) => {
        if (pinContent.length > 0) {
          clearLine(pinContent);
        }

        writer(formatter(format, ...param));

        if (pinContent.length > 0) {
          writer(pinContent);
        }
      },
      {
        formatter,
      }
    );
  };
  type $Print = ReturnType<typeof Print>;
  const PipeFrom = (writer: $Writer, print: $Print) => {
    return (input: Readable) => {
      let hasOutput = false;
      const onData = (chunk: any) => {
        hasOutput = true;
        print(String(chunk));
      };
      input.on("data", onData);
      input.once("end", () => {
        if (hasOutput) {
          writer("\n");
        }
        input.off("data", onData);
      });
    };
  };
  const pinMap = new Map<string, string>();
  const Pin = (print: $Print, writer: $Writer) => {
    const pin: PKGM.Print = (label: string, ...args: unknown[]) => {
      pinMap.set(label, print.formatter(...args));
      if (pinContent.length > 0) {
        clearLine(pinContent);
      }

      pinContent = [...pinMap.values()].join("");

      if (pinContent.length > 0) {
        writer(pinContent);
      }
    };
    return pin;
  };
  const UnPin = (writer: $Writer) => {
    const unpin: PKGM.Print = (label: string) => {
      if (pinMap.has(label) === false) {
        return;
      }
      pinMap.delete(label);

      if (pinContent.length > 0) {
        clearLine(pinContent);
      }
      pinContent = [...pinMap.values()].join("");

      if (pinContent.length > 0) {
        writer(pinContent);
      }
    };
    return unpin;
  };

  const SuperPrinter = (linePrefix: string, writer: $Writer) => {
    const write = Print(linePrefix, writer, false);
    const log = Print(linePrefix, writer, true);
    const pin = Pin(log, writer);
    const unpin = UnPin(writer);
    const pipeFrom = PipeFrom(writer, write);
    return Object.assign(log, { write, pin, unpin, pipeFrom });
  };
  const {
    prefix,
    stderrWriter,
    stdoutWriter,

    stdinfoWriter = stdoutWriter,
    stdsuccWriter = stdoutWriter,
    stdwarnWriter = stderrWriter,

    clearScreen = noop,
    clearLine = noop,
  } = options;

  const log = SuperPrinter(chalk.cyan(options.logPrefix ?? prefix), stdoutWriter);
  const info = SuperPrinter(chalk.blue(options.infoPrefix ?? prefix), stdinfoWriter);
  const warn = SuperPrinter(chalk.yellow(options.warnPrefix ?? prefix), stdwarnWriter);
  const success = SuperPrinter(chalk.green(options.successPrefix ?? prefix), stdsuccWriter);
  const error = SuperPrinter(chalk.red(options.errorPrefix ?? prefix), stderrWriter);
  const group = (...labels: any[]) => {
    log(...labels);
    groupPrefix += "\t";
  };
  const groupEnd = () => {
    groupPrefix = groupPrefix.slice(0, -1);
  };

  //#region LOADING

  const loadingFrameIdMap = new Map<
    string,
    { pinLabel: string; frame: number; rafId: number; render: () => void; lastArgs: unknown[] }
  >();

  const loadingStart = (id: string = "default") => {
    id = String(id);
    if (loadingFrameIdMap.has(id)) {
      warn(`Label '${id}' already exists for logger.loadingStart()`);
      return;
    }

    const pinLabel = `#loading:${id}`;
    const render = () => {
      const loadingSymbol = FRAMES[info.frame % FRAMES.length] + " ";
      if (typeof info.lastArgs[0] === "string") {
        const args = info.lastArgs.slice();
        args[0] = loadingSymbol + " " + args[0];
        log.pin(pinLabel, ...args);
      } else {
        log.pin(pinLabel, loadingSymbol, ...info.lastArgs);
      }
    };
    const info = { pinLabel, frame: -1, rafId: -1, render, lastArgs: [] as any[] };
    /// 持续打印
    (async () => {
      do {
        info.frame += 1;
        render();
        await afm.nextFrame();
      } while (hasLoading(id));
    })();
    loadingFrameIdMap.set(id, info);
  };
  const loadingLog = (id: string, ...args: unknown[]) => {
    id = String(id);
    const info = loadingFrameIdMap.get(id);
    if (info === undefined) {
      warn(`No such label '${id}' for logger.loadingEnd()`);
      return;
    }
    info.lastArgs = args;
    info.render();
  };
  const loadingEnd = (id: string = "default") => {
    id = String(id);
    const info = loadingFrameIdMap.get(id);
    if (info === undefined) {
      warn(`No such label '${id}' for logger.loadingEnd()`);
      return;
    }
    afm.cancelAnimationFrame(info.rafId);
    loadingFrameIdMap.delete(id);
    log.unpin(info.pinLabel);
  };
  const hasLoading = (id: string = "default") => {
    id = String(id);
    return loadingFrameIdMap.has(id);
  };
  //#endregion

  //#region PROGRESS

  const progressFrameIdMap = new Map<
    string,
    { pinLabel: string; frame: number; total: number; current: number; render: () => void; lastArgs: unknown[] }
  >();
  const progressStart = (id: string, total: number, current: number = 0) => {
    id = String(id);
    if (progressFrameIdMap.has(id)) {
      warn(`Label '${id}' already exists for logger.progressStart()`);
      return;
    }
    const pinLabel = `#loading:${id}`;
    const render = () => {
      const progress = Math.min(1, Math.max(info.current / info.total || 0, 0));
      const progressSymbol = chalk.magenta(
        (".".repeat(info.frame % 3) + (progress * 100).toFixed(2) + "%").padEnd(10, ".")
      );
      if (typeof info.lastArgs[0] === "string") {
        const args = info.lastArgs.slice();
        args[0] = progressSymbol + " " + args[0];
        log.pin(pinLabel, ...args);
      } else {
        log.pin(pinLabel, progressSymbol, ...info.lastArgs);
      }
    };

    const info = { pinLabel, frame: -1, total, current, render, lastArgs: [] as unknown[] };
    /// 持续打印
    (async () => {
      do {
        info.frame += 1;
        render();
        await afm.nextFrame();
      } while (hasLoading(id));
    })();

    progressFrameIdMap.set(id, info);
  };
  const progressLog = (label: string, current: number, ...args: unknown[]) => {
    label = String(label);
    const info = progressFrameIdMap.get(label);
    if (info === undefined) {
      warn(`No such label '${label}' for logger.progressLog()`);
      return;
    }
    info.current = current;
    info.lastArgs = args;
    info.render();
  };
  const progressEnd = (label: string) => {
    label = String(label);
    const info = progressFrameIdMap.get(label);
    if (info === undefined) {
      warn(`No such label '${label}' for logger.progressEnd()`);
      return;
    }
    progressFrameIdMap.delete(label);
    log.unpin(info.pinLabel);
  };
  //#endregion

  return {
    isSuperLogger: true,
    log,
    info,
    warn,
    success,
    error,
    group,
    groupEnd,
    clear: clearScreen,
    // clearLine,
    loadingStart,
    loadingLog,
    loadingEnd,
    hasLoading,
    progressStart,
    // progressUpdate,
    progressLog,
    progressEnd,
  } as PKGM.Logger;
};
const noop = () => {};
