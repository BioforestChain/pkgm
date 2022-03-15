/// <reference path="./typings/index.d.ts"/>
const ARGV = process.argv.slice(2);

import { EasyMap } from "@bfchain/util-extends-map";
import { PromiseOut } from "@bfchain/util-extends-promise-out";
import { setTimeout } from "node:timers/promises";
import "./src/bin/@bin.types";
import { ArgvParser, formatTypedValue } from "./src/bin/ArgvParser";
import { CommandContext } from "./src/bin/CommandContext";

export const defineCommand = <T extends Bfsp.Bin.CommandConfig>(
  funName: string,
  config: T,
  hanlder: (
    params: Bfsp.Bin.ToParamsType<Bfsp.Bin.GetParamsInputType<T>>,
    args: Bfsp.Bin.ToArgsTupleType<Bfsp.Bin.GetArgsInputType<T>>,
    ctx: CommandContext
  ) => unknown
) => {
  const binRunner = async (argv: string[], ctx: CommandContext) => {
    try {
      const hanlderParams = {} as any;
      const hanlderArgs = [] as any;
      const options = [...argv];
      let paramOptions: string = "";
      let argName: string = "";
      let argOptions: string = "";

      const argsParser = new ArgvParser(argv);

      /// params
      if (config.params !== undefined) {
        for (const paramConfig of config.params as Bfsp.Bin.CommandConfig.ParamInput[]) {
          if (paramConfig.type === "rest") {
            if (config.params[config.params.length - 1] !== paramConfig) {
              throw `SCHEMA_ERR: type 'rest' must be latest param`;
            }
            const rest = {} as any;
            for (const arg of argv) {
              const parsedArg = arg.match(/\-{1,2}(.+)\=([\w\W]*?)/);
              if (parsedArg !== null) {
                rest[parsedArg[1]] = parsedArg[2];
              }
            }
            hanlderParams[paramConfig.name] = rest;
          } else {
            paramOptions += `   --${paramConfig.name} \t\t${paramConfig.description}\n`;
            const found = argsParser.getParamInfo(paramConfig.name, undefined, paramConfig.type);
            if (found !== undefined) {
              const value = formatTypedValue(found.value, paramConfig.type);
              if (value === undefined) {
                throw `SYNTAX_ERR: '${funName}' got invalid param '${found.name}' with value: '${found.value}'`;
              }
              hanlderParams[paramConfig.name] = value;
              argsParser.freeParamInfo(paramConfig.name, undefined);
            } else if (paramConfig.require) {
              throw `NO_FOUND_ERR: '${funName}' require param: '${paramConfig.name}'`;
            }
          }
        }
      }

      {
        const argsMap = new Map(argsParser.argsEntries());
        let hasError = false;
        for (const [key, args] of argsMap) {
          if (key === "") {
            continue;
          }
          ctx.logger.error(`invalid param: ${key} = ${args.join(" ")}`);
          hasError = true;
        }
        if (hasError) {
          process.exit(1);
        }
      }
      const args = argsParser.getArgs();

      /// args
      if (config.args !== undefined) {
        const configArgsSchemas: Bfsp.Bin.CommandConfig.ArgInput[][] =
          Array.isArray(config.args) && Array.isArray(config.args[0]) ? config.args : [config.args];

        let schemaMatched = false;
        for (const configArgs of configArgsSchemas) {
          if (configArgs.filter((c) => c.type !== "rest").length > args.length && !options.includes("--help")) {
            continue;
          }
          schemaMatched = true;
          for (const [i, configArg] of configArgs.entries()) {
            if (configArg.type === "rest") {
              if (i !== configArgs.length - 1) {
                throw `SCHEMA_ERR: type 'rest' must be latest arg`;
              }
              hanlderArgs[i] = args.slice(i);
            } else {
              argName = ` <${configArg.name}>`;
              argOptions += `<${configArg.name}>\t\t\t${configArg.description}\n`;
              const value = formatTypedValue(args[i], configArg.type);
              if (value === undefined) {
                schemaMatched = false;
                break;
              }
              hanlderArgs[i] = value;
            }
          }
          if (schemaMatched) {
            break;
          }
        }

        if (schemaMatched === false) {
          throw (
            `SYNTAX_ERR: '${funName}' got invalid arguments. like:\n` +
            configArgsSchemas
              .map(
                (configArgs) =>
                  `  ${funName}(${configArgs
                    .map((arg) => `${arg.name || "anonymous"}: ${arg.type || "string"}`)
                    .join(", ")})`
              )
              .join("\n")
          );
        }
      }

      // bfsp/bfsw help
      if (options.includes("--help")) {
        const commandName = process.argv[1];
        const isSingle = commandName.includes("bfsp") ? true : false;
        console.log(`Usage: ${isSingle ? "bfsp" : "bfsw"} ${funName} ${paramOptions ? "[options]" : ""}${argName}\n`);
        console.log(config.description ? `${config.description}\n` : "");
        console.log(paramOptions ? "Options:" : "");
        console.log(paramOptions);
        console.log(argOptions);
        process.exit(0);
      }

      await hanlder(hanlderParams, hanlderArgs, ctx);
    } catch (err) {
      ctx.logger.error(err);
    }
  };

  const info = {
    name: funName,
    config,
    runner: binRunner,
  };

  /// 尝试执行
  tryRunCommand(info);

  return info;
};

/** 执行过的程序 */
let _runnedCommand: CommandInfo | undefined;
const commandName = ARGV[0];
/**尝试根据 argv 的输入进行执行 */
const tryRunCommand = (info: CommandInfo) => {
  if (commandName === info.name || info.config.alias?.includes(commandName)) {
    return runCommand(info);
  }
};
/**执行指定程序 */
const runCommand = async (info: CommandInfo) => {
  const ctx = new CommandContext({
    prefix: info.name,
    stderr: process.stderr,
    stdout: process.stdout,
  });
  try {
    _runnedCommand = info;
    await info.runner(ARGV.slice(1), ctx);
  } catch (err) {
    ctx.logger.error(err);
  }
};

export type CommandInfo = ReturnType<typeof defineCommand>;

let _defaultCommand: CommandInfo | undefined;
/**如果程序退出之前发现没有执行任何程序，那么会触发执行默认程序
 * 默认程序不可重复注册
 */
export const defineDefaultCommand = (info: CommandInfo) => {
  if (_defaultCommand !== undefined) {
    throw new Error(`already define default command: ${info.name}`);
  }
  _defaultCommand = info;
  process.once("beforeExit", async () => {
    if (_runnedCommand === undefined) {
      runCommand(info);
    }
  });
};
