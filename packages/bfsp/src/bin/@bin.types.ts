declare namespace Bfsp {
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
