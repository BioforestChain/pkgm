/// <reference path="./typings/index.d.ts"/>
export const defineBin = <T extends Bfsp.Bin.CommandConfig>(
  funName: string,
  config: T,
  hanlder: (
    params: Bfsp.Bin.ToParamsType<Bfsp.Bin.GetParamsInputType<T>>,
    rests: Bfsp.Bin.ToRestsTupleType<Bfsp.Bin.GetRestsInputType<T>>
  ) => unknown
) => {
  console.log(hanlder);
};
export declare namespace Bfsp {
  namespace Bin {
    interface CommandConfig<
      P extends readonly CommandConfig.OptionalInput[] = any,
      R extends readonly CommandConfig.Input[] | readonly (readonly CommandConfig.Input[])[] = any
    > {
      readonly params?: P;
      readonly rests?: R;
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
    type ToParamsType<T> = T extends readonly [infer R, ...infer Rests] ? ToParamType<R> & ToParamsType<Rests> : {};

    type GetRestsInputType<T> = T extends CommandConfig<infer _, infer R>
      ? R extends readonly CommandConfig.Input[]
        ? readonly [R]
        : R
      : never;
    type ToRestType<T> = T extends CommandConfig.Input<infer _, infer Type>
      ? CommandConfig.FromInputType<Type>
      : unknown;
    type ToRestsType<T> = T extends readonly [infer R, ...infer Rests]
      ? [argv: ToRestType<R>, ..._: ToRestsType<Rests>]
      : [];
    type ToRestsTupleType<T> = T extends readonly [infer R, ...infer Rests]
      ? ToRestsType<R> | ToRestsTupleType<Rests>
      : never;
  }
}
