import chalk from "chalk";
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
  private _logger?: PKGM.Logger;
  get logger() {
    if (this._logger === undefined) {
      let preLinePrefix = "";
      const Print = (linePrefix: string, stream: NodeJS.WritableStream, line: boolean) => {
        linePrefix += ": ";
        return (format?: any, ...param: any[]) => {
          // 如果前缀改变了，那么强制换行
          if (preLinePrefix !== "" && linePrefix !== preLinePrefix) {
            stream.write("\n");
            preLinePrefix = "";
          }
          const content = util.format(format, ...param);

          // 结尾换行符会导致打印多个linePrefix
          let out: string = "";
          if(content.endsWith("\n")) {
            out = linePrefix + content.replace(/\n$/, "").replace(/\n/g, "\n" + linePrefix) + "\n";
          } else {
            out = linePrefix + content.replace(/\n/g, "\n" + linePrefix);
          }

          // 写入回车
          if (line) {
            out += "\n";
            preLinePrefix = "";
          } else {
            preLinePrefix = linePrefix;
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
        return Object.assign(print, { line, pipeFrom });
      };
      const { prefix, stderr, stdout } = this.options;
      this._logger = {
        isSuperLogger: true,
        log: SuperPrinter(chalk.cyan(prefix), stdout),
        info: SuperPrinter(chalk.blue(prefix), stdout),
        warn: SuperPrinter(chalk.yellow(prefix), stderr),
        success: SuperPrinter(chalk.green(prefix), stdout),
        error: SuperPrinter(chalk.red(prefix), stderr),
      };
    }
    return this._logger;
  }
}
