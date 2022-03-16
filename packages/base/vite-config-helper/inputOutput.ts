// import type { InputOption } from "rollup";
const inputMap = new Map<string, InputConfig>();
/**
 * 输入与输出
 */
export type InputConfig = {
  input: {
    [entryAlias: string]: string;
  };
  outDir: string;
  name?: string;
  default?: boolean;
};
let defaultConfig: InputConfig | undefined;
export const defineInputConfig = (opts: InputConfig) => {
  const name = opts.name ?? opts.outDir;
  if (opts.default) {
    defaultConfig = opts;
  }
  inputMap.set(name, opts);
  return opts.input;
};
export const findInputConfig = (name: string) => {
  return inputMap.get(name) ?? defaultConfig;
};
