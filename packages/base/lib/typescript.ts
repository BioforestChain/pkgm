import { require } from "../src/toolkit.require";
import path from "node:path";
import type $Typescript from "typescript";
import typescript from "typescript";
export const getTypescript = () => {
  return import("typescript");
};
export { $Typescript };
export const getTscPath = () => {
  return path.resolve(require.resolve("typescript"), "../tsc.js");
};

// 无法直接export { transpileModule }，SyntaxError: Named export 'transpileModule' not found.
// The requested module 'typescript' is a CommonJS module, which may not support all module.exports as named exports.
export function transpileModule(input: string, transpileOptions: $Typescript.TranspileOptions) {
  return typescript.transpileModule(input, transpileOptions);
}
