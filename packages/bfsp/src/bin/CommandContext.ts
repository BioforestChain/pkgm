import { chalk } from "@bfchain/pkgm-base/lib/chalk";
import { createInterface } from "node:readline";
import type { Readable } from "node:stream";
import util from "node:util";
export class CommandContext {
  constructor(
    private options: {
      prefix: string;
      stdout: NodeJS.WritableStream;
      stderr: NodeJS.WritableStream;
    }
  ) {}
  async question<R = string>(
    query: string,
    options: {
      map?: (answer: string) => R;
      filter?: (answer: R) => BFChainUtil.PromiseMaybe<boolean>;
      stringify?: (result: R) => string;
      printOutput?: boolean;
      trimLines?: boolean;
      stdout?: NodeJS.WritableStream;
      stdin?: NodeJS.ReadableStream;
      prompt?: string;
    } = {}
  ) {
    const rl = createInterface({
      input: options.stdin ?? process.stdin,
      output: options.stdout ?? this.options.stdout ?? process.stdout,
      prompt: options.prompt ?? chalk.cyan(this.options.prefix) + ": ",
    });
    const {
      map = (answer) => answer.trim(),
      filter = (result) => Boolean(result),
      stringify = (result) => String(result),
      printOutput = true,
      trimLines = true,
    } = options;

    if (trimLines) {
      query = query
        .trim()
        .split("\n")
        .map((line) => rl.getPrompt() + line.trim())
        .join("\n");
    } else {
      query = query.replace(/\n/g, "\n" + rl.getPrompt());
    }

    do {
      const res = map(
        await new Promise<string>((resolve) => {
          rl.prompt();
          rl.question(query, resolve);
        })
      ) as R;
      if (await filter(res)) {
        if (printOutput) {
          rl.prompt();
          rl.write(stringify(res) + "\n");
        }
        rl.close();
        return res;
      }
    } while (true);
  }
  readonly chalk = chalk;
  private _logger?: PKGM.Logger;
  get logger() {
    if (this._logger === undefined) {
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
      let groupPrefix = "";
      const Print = (linePrefix: string, stream: NodeJS.WritableStream, lineMode: boolean) => {
        linePrefix += ": ";
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
          stream.write(out);
        };
      };
      const PipeFrom = (stream: NodeJS.WritableStream, print: PKGM.Print) => {
        return (input: Readable) => {
          let hasOutput = false;
          const onData = (chunk: any) => {
            hasOutput = true;
            print(String(chunk));
          };
          input.on("data", onData);
          input.once("end", () => {
            if (hasOutput) {
              stream.write("\n");
            }
            input.off("data", onData);
          });
        };
      };
      const SuperPrinter = (linePrefix: string, stream: NodeJS.WritableStream) => {
        const print = Print(linePrefix, stream, false);
        const line = Print(linePrefix, stream, true);
        const pipeFrom = PipeFrom(stream, print);
        return Object.assign(line, { write: print, pipeFrom });
      };
      const { prefix, stderr, stdout } = this.options;
      const log = SuperPrinter(chalk.cyan(prefix), stdout);
      const info = SuperPrinter(chalk.blue(prefix), stdout);
      const warn = SuperPrinter(chalk.yellow(prefix), stderr);
      const success = SuperPrinter(chalk.green(prefix), stdout);
      const error = SuperPrinter(chalk.red(prefix), stderr);
      const group = (...labels: any[]) => {
        log(...labels);
        groupPrefix += "\t";
      };
      const groupEnd = () => {
        groupPrefix = groupPrefix.slice(0, -1);
      };
      this._logger = {
        isSuperLogger: true,
        log,
        info,
        warn,
        success,
        error,
        group,
        groupEnd,
      };
    }
    return this._logger;
  }
}
