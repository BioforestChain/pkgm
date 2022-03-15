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
  const binRunner = async (argv: string[]) => {
    const ctx = new CommandContext({
      prefix: funName,
      stderr: process.stderr,
      stdout: process.stdout,
    });
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
      process.exit(1);
    }
  };

  const info = {
    name: funName,
    config,
    runner: binRunner,
  };
  commandMap.forceGet(funName).resolve(info);

  return info;
};

type CommandInfo = ReturnType<typeof defineCommand>;
const commandMap = EasyMap.from<string, PromiseOut<CommandInfo>>({
  creater: (funName: string) => {
    const dealyRegPo = new PromiseOut<CommandInfo>();

    setTimeout(1000).then(() => {
      if (dealyRegPo.is_finished === false) {
        dealyRegPo.reject(new Error(`Command "${funName}" not found.`)); // Did you mean "i"?
      }
    });
    return dealyRegPo;
  },
});
(async () => {
  const info = await commandMap.forceGet(ARGV[0]).promise;
  info.runner(ARGV.slice(1));
})().catch(console.log);
// import { EasyMap } from "@bfchain/util-extends-map";

// /**
//  * 将有关联的参数聚合在一起
//  * 这里宽松地解析参数，不区分类型。
//  * 我们会在所有的params解析完成后，去除掉那些有意义的params，将剩下交给args进行进一步解析
//  */
// const argsMapCache = EasyMap.from({
//   creater: (argv: string[]) => {
//     const argsMap = EasyMap.from({
//       creater: (_argName: string) => {
//         return [] as string[];
//       },
//     });
//     let curArgName = ""; // = { name: "", rawValues: [] as string[] };
//     // argsMap.set(curArg.name, curArg.rawValues);

//     for (const arg of argv) {
//       const matchArgPrefix = arg.match(/-+?(\w+?)\=?/);
//       if (matchArgPrefix !== null) {
//         const [argPrefix, argName] = matchArgPrefix;
//         let rawValue: undefined | string;
//         if (argPrefix.endsWith("=")) {
//           rawValue = arg.slice(argPrefix.length);
//         }

//         /// forceGet，确保创建出空数组，以代表字段过
//         const rawValues = argsMap.forceGet(argName);
//         /// 保存值
//         if (typeof rawValue === "string") {
//           rawValues.push(rawValue);
//         }
//       } else {
//         argsMap.forceGet(curArgName).push(arg);
//       }
//     }
//     return argsMap;
//   },
// });
// const freeArgs = (argv: string[], name: string) => {
//   const argsMap = argsMapCache.forceGet(argv);
//   const argRawValues = argsMap.get(name);
//   if (argRawValues === undefined) {
//     return;
//   }
//   argsMap.forceGet("").push(...argRawValues);
//   argRawValues.length = 0;
// };

// const findArgByName = (argv: string[], name: string, type: Bfsp.Bin.CommandConfig.InputType) => {
//   const argsMap = argsMapCache.forceGet(argv);
//   const argRawValues = argsMap.get(name);
//   if (argRawValues === undefined) {
//     return undefined;
//   }

//   /**
//    * 尝试根据类型获取所需的参数
//    * 有符合规则的才会拿出来，不符合规则的会被保留
//    */
//   switch (type) {
//     case "boolean": {
//       const maybeBoolRawValue = argRawValues[0];
//       if (typeof maybeBoolRawValue === "string") {
//         const boolValue = maybeBoolRawValue.toLowerCase();
//         if (
//           boolValue === "n" ||
//           boolValue === "no" ||
//           boolValue === "f" ||
//           boolValue === "false" ||
//           boolValue === "y" ||
//           boolValue === "yes" ||
//           boolValue === "t" ||
//           boolValue === "true"
//         ) {
//           return argRawValues.shift();
//         }
//       } else {
//         return "yes";
//       }
//     }
//     case "number": {
//       const maybeNumberRawValue = argRawValues[0];
//       if (typeof maybeNumberRawValue === "string") {
//         const numValue = Number.parseFloat(maybeNumberRawValue);
//         if (Number.isFinite(numValue)) {
//           return argRawValues.shift();
//         }
//       }
//       break;
//     }
//     case "string":
//     default: {
//       return (argRawValues.shift() ?? "").toLowerCase();
//     }
//   }
// };

// const getArg = (
//   argv: string[],
//   name: string,
//   aliases?: string[],
//   type: Bfsp.Bin.CommandConfig.InputType = "string"
// ) => {
//   let foundArg = findArgByName(argv, name, type);
//   if (foundArg !== undefined) {
//     return { argName: name, value: foundArg };
//   }
//   if (aliases !== undefined) {
//     for (const alias of aliases) {
//       foundArg = findArgByName(argv, alias, type);
//       if (foundArg !== undefined) {
//         return { argName: alias, value: foundArg };
//       }
//     }
//   }
// };
// const formatTypedValue = (value: string, type?: Bfsp.Bin.CommandConfig.InputType) => {
//   switch (type) {
//     case "boolean":
//       value = value.toLowerCase();
//       if (value === "f" || value === "false" || value === "n" || value === "no") {
//         return false;
//       }
//       return true; //(value === "true" || value === "yes" || value === "")
//     case "number":
//       const num = parseFloat(value);
//       if (Number.isFinite(num)) {
//         return num;
//       }
//       break;
//     case "string":
//     default:
//       return value;
//   }
// };
