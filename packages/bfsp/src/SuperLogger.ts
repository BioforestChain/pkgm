import { chalk } from "@bfchain/pkgm-base/lib/chalk";
import type { Readable } from "node:stream";
import util from "node:util";

type $Writer = (s: string) => void;
export const createSuperLogger = (options: {
  prefix: string;
  stdoutWriter: $Writer;
  stderrWriter: $Writer;
  logPrefix?: string;
  infoPrefix?: string;
  warnPrefix?: string;
  errorPrefix?: string;
  successPrefix?: string;
  clearScreen?: () => void;
  clearLine?: () => void;
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
   * 上一次是否是writeLine模式
   * 每一次print都会被重置状态成false
   */
  let preWriteLine = false;
  let groupPrefix = "";
  const Print = (linePrefix: string, writer: $Writer, lineMode: boolean) => {
    if (linePrefix.length > 0) {
      linePrefix += " ";
    }
    return (format?: any, ...param: any[]) => {
      preWriteLine = false;
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
      writer(out);
    };
  };
  const PipeFrom = (writer: $Writer, print: PKGM.Print) => {
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
  const WriteLine = (print: PKGM.Print) => {
    const line: PKGM.Print = (...args) => {
      if (preWriteLine) {
        clearLine();
      }
      print(...args);
      preWriteLine = true;
    };
    return line;
  };
  const SuperPrinter = (linePrefix: string, writer: $Writer) => {
    const write = Print(linePrefix, writer, false);
    const log = Print(linePrefix, writer, true);
    const line = WriteLine(write);
    const pipeFrom = PipeFrom(writer, write);
    return Object.assign(log, { write, line, pipeFrom });
  };
  const { prefix, stderrWriter, stdoutWriter, clearScreen = noop, clearLine = noop } = options;
  const log = SuperPrinter(chalk.cyan(options.logPrefix ?? prefix), stderrWriter);
  const info = SuperPrinter(chalk.blue(options.infoPrefix ?? prefix), stderrWriter);
  const warn = SuperPrinter(chalk.yellow(options.warnPrefix ?? prefix), stdoutWriter);
  const success = SuperPrinter(chalk.green(options.successPrefix ?? prefix), stderrWriter);
  const error = SuperPrinter(chalk.red(options.errorPrefix ?? prefix), stdoutWriter);
  const group = (...labels: any[]) => {
    log(...labels);
    groupPrefix += "\t";
  };
  const groupEnd = () => {
    groupPrefix = groupPrefix.slice(0, -1);
  };
  return {
    isSuperLogger: true,
    log,
    info,
    warn,
    success,
    error,
    group,
    groupEnd,
    clearScreen,
    clearLine,
  } as PKGM.Logger;
};
const noop = () => {};
