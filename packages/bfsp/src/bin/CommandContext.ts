import { chalk } from "@bfchain/pkgm-base/lib/chalk";
import { createInterface } from "node:readline";
import type { Readable } from "node:stream";
import util from "node:util";
import { createSuperLogger } from "../SuperLogger";
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
  readonly chalk = chalk as unknown as typeof import("chalk").default;
  private _logger?: PKGM.Logger;
  get logger() {
    if (this._logger === undefined) {
      this._logger = createSuperLogger({
        prefix: this.options.prefix,
        stdoutWriter: (s) => this.options.stdout.write(s),
        stderrWriter: (s) => this.options.stderr.write(s),
      });
    }
    return this._logger;
  }
}
