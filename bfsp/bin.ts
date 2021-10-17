/// <reference path="./typings/index.d.ts"/>
const ARGV = process.argv.slice(2);

export const defineBin = <T extends Bfsp.Bin.CommandConfig>(
  funName: string,
  config: T,
  hanlder: (
    params: Bfsp.Bin.ToParamsType<Bfsp.Bin.GetParamsInputType<T>>,
    args: Bfsp.Bin.ToArgsTupleType<Bfsp.Bin.GetArgsInputType<T>>
  ) => unknown
) => {
  // console.log(hanlder);
  if (ARGV[0] !== funName) {
    return;
  }
  const argv = ARGV.slice();
  const hanlderParams = {} as any;
  const hanlderArgs = [] as any;

  /// params
  if (config.params !== undefined) {
    for (const paramConfig of config.params as Bfsp.Bin.CommandConfig.OptionalInput[]) {
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

  const args = argv.filter((arg) => !/\-{1,2}.+\=/.test(arg));

  /// args
  if (config.args !== undefined) {
    const configArgsSchemas: Bfsp.Bin.CommandConfig.Input[][] =
      Array.isArray(config.args) && Array.isArray(config.args[0]) ? config.args : [config.args];

    let schemaMatched = false;
    for (const configArgs of configArgsSchemas) {
      if (configArgs.length > args.length) {
        continue;
      }
      schemaMatched = true;
      for (const [i, configArg] of configArgs.entries()) {
        const value = formatTypedValue(args[i], configArg.type);
        if (value === undefined) {
          schemaMatched = false;
          break;
        }
        hanlderArgs[i] = value;
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

  hanlder(hanlderParams, hanlderArgs);
};

export const getArg = <T extends string>(argv: string[], name: string, aliases?: string[]) => {
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
export const formatTypedValue = (value: string, type?: Bfsp.Bin.CommandConfig.InputType) => {
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
      P extends readonly CommandConfig.OptionalInput[] = any,
      R extends readonly CommandConfig.Input[] | readonly (readonly CommandConfig.Input[])[] = any
    > {
      readonly params?: P;
      readonly args?: R;
    }
    namespace CommandConfig {
      type InputType = "number" | "string" | "boolean";

      interface Input<NAME extends string = string, TYPE extends InputType = InputType> {
        readonly name: NAME;
        readonly type?: TYPE;
        readonly description?: string;
      }

      interface OptionalInput<
        NAME extends string = string,
        TYPE extends InputType = InputType,
        R extends boolean = boolean
      > extends Input<NAME, TYPE> {
        readonly require?: R;
      }

      type FromInputType<T> = T extends "number" ? number : T extends "boolean" ? boolean : string;
    }

    type GetParamsInputType<T> = T extends CommandConfig<infer P, infer _> ? P : never;
    type ToParamType<T> = T extends CommandConfig.OptionalInput<infer Name, infer Type, infer Req>
      ? boolean extends Req
        ? {
            [key in Name]?: CommandConfig.FromInputType<Type>;
          }
        : true extends Req
        ? {
            [key in Name]: CommandConfig.FromInputType<Type>;
          }
        : {
            [key in Name]?: CommandConfig.FromInputType<Type>;
          }
      : {};
    type ToParamsType<T> = T extends readonly [infer R, ...infer Args] ? ToParamType<R> & ToParamsType<Args> : {};

    type GetArgsInputType<T> = T extends CommandConfig<infer _, infer R>
      ? R extends readonly CommandConfig.Input[]
        ? readonly [R]
        : R
      : never;
    type ToArgType<T> = T extends CommandConfig.Input<infer _, infer Type>
      ? CommandConfig.FromInputType<Type>
      : unknown;
    type ToArgsType<T> = T extends readonly [infer R, ...infer Args]
      ? [argv: ToArgType<R>, ..._: ToArgsType<Args>]
      : [];
    type ToArgsTupleType<T> = T extends readonly [infer R, ...infer Args]
      ? ToArgsType<R> | ToArgsTupleType<Args>
      : never;
  }
}
