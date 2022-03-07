/// <reference path="./typings/index.d.ts"/>
const ARGV = process.argv.slice(2);

export const defineCommand = <T extends Bfsp.Bin.CommandConfig>(
  funName: string,
  config: T,
  hanlder: (
    params: Bfsp.Bin.ToParamsType<Bfsp.Bin.GetParamsInputType<T>>,
    args: Bfsp.Bin.ToArgsTupleType<Bfsp.Bin.GetArgsInputType<T>>
  ) => unknown
) => {
  const binRunner = (argv: string[]) => {
    const hanlderParams = {} as any;
    const hanlderArgs = [] as any;
    const options = JSON.parse(JSON.stringify(argv));
    let paramOptions: string = "";
    let argName: string = "";
    let argOptions: string = "";

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
          // argv.filter((arg) => /\-{1,2}(.+)\=/.test(arg));
        } else {
          paramOptions += `   --${paramConfig.name}=\t\t${paramConfig.description}\n`;
          const found = getArg(argv, paramConfig.name);
          if (found !== undefined) {
            const value = formatTypedValue(found.value, paramConfig.type);
            if (value === undefined) {
              throw `SYNTAX_ERR: '${funName}' got invalid param: '${found.arg}'`;
            }
            argv.splice(argv.indexOf(found.arg), 1);
            hanlderParams[paramConfig.name] = value;
          } else if (paramConfig.require) {
            throw `NO_FOUND_ERR: '${funName}' require param: '${paramConfig.name}'`;
          }
        }
      }
    }

    const args = argv.filter((arg) => !/\-{1,2}.+\=/.test(arg));

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
    if(options.includes("--help")) {
      const commandName = process.argv[1];
      const isSingle = commandName.includes("bfsp") ? true : false;
      console.log(`Usage: ${isSingle ? "bfsp" : "bfsw"} ${funName} ${paramOptions ? "[options]" : ""}${argName}\n`);
      console.log(config.description ? `${config.description}\n` : "");
      console.log(paramOptions ? "Options:" : "");
      console.log(paramOptions);
      console.log(argOptions);
      process.exit(0);
    }

    return hanlder(hanlderParams, hanlderArgs);
  };
  if (ARGV[0] === funName || config.alias?.includes(ARGV[0])) {
    binRunner(ARGV.slice(1));
  }
  return binRunner;
};

const getArg = <T extends string>(argv: string[], name: string, aliases?: string[]) => {
  let foundArg = argv.find((arg) => arg.startsWith(`--${name}=`) || arg.startsWith(`-${name}=`));
  if (foundArg === undefined && aliases !== undefined) {
    for (const alias of aliases) {
      foundArg = argv.find((arg) => arg.startsWith(`--${alias}=`) || arg.startsWith(`-${alias}=`));
      if (foundArg !== undefined) {
        break;
      }
    }
  }

  if (foundArg) {
    const index = foundArg.indexOf("=");
    return { value: foundArg.slice(index + 1) as unknown as T, arg: foundArg };
  }
};
const formatTypedValue = (value: string, type?: Bfsp.Bin.CommandConfig.InputType) => {
  switch (type) {
    case "boolean":
      value = value.toLowerCase();
      if (value === "true" || value === "yes") {
        return true;
      }
      if (value === "false" || value === "no" || value === "") {
        return false;
      }
      break;
    case "number":
      const num = parseFloat(value);
      if (Number.isFinite(num)) {
        return num;
      }
      break;
    case "string":
    default:
      return value;
  }
};

export declare namespace Bfsp {
  namespace Bin {
    interface CommandConfig<
      P extends readonly CommandConfig.ParamInput[] = any,
      R extends readonly CommandConfig.ArgInput[] | readonly (readonly CommandConfig.ArgInput[])[] = any
    > {
      readonly params?: P;
      readonly args?: R;
      alias?: string[];
      description?: string;
    }
    namespace CommandConfig {
      type InputType = "number" | "string" | "boolean" | "rest";

      interface ArgInput<NAME extends string = string, TYPE extends InputType = InputType> {
        readonly name: NAME;
        readonly type?: TYPE;
        readonly description?: string;
      }

      interface ParamInput<
        NAME extends string = string,
        TYPE extends InputType = InputType,
        R extends boolean = boolean
      > extends ArgInput<NAME, TYPE> {
        readonly require?: R;
      }

      type FromArgInputType<T> = T extends "number"
        ? number
        : T extends "boolean"
        ? boolean
        : T extends "rest"
        ? string[]
        : string;
      type FromParamInputType<T> = T extends "number"
        ? number
        : T extends "boolean"
        ? boolean
        : T extends "rest"
        ? { [key: string]: string }
        : string;
    }

    type GetParamsInputType<T> = T extends CommandConfig<infer P, infer _> ? P : never;
    type ToParamType<T> = T extends CommandConfig.ParamInput<infer Name, infer Type, infer Req>
      ? boolean extends Req
        ? {
            [key in Name]?: CommandConfig.FromParamInputType<Type>;
          }
        : true extends Req
        ? {
            [key in Name]: CommandConfig.FromParamInputType<Type>;
          }
        : {
            [key in Name]?: CommandConfig.FromParamInputType<Type>;
          }
      : {};
    type ToParamsType<T> = T extends readonly [infer R, ...infer Args] ? ToParamType<R> & ToParamsType<Args> : {};

    type GetArgsInputType<T> = T extends CommandConfig<infer _, infer R>
      ? R extends readonly CommandConfig.ArgInput[]
        ? readonly [R]
        : R
      : never;
    type ToArgType<T> = T extends CommandConfig.ArgInput<infer _, infer Type>
      ? CommandConfig.FromArgInputType<Type>
      : unknown;
    type ToArgsType<T> = T extends readonly [infer R, ...infer Args]
      ? [argv: ToArgType<R>, ..._: ToArgsType<Args>]
      : [];
    type ToArgsTupleType<T> = T extends readonly [infer R, ...infer Args]
      ? ToArgsType<R> | ToArgsTupleType<Args>
      : never;
  }
}
