import { require } from "../src/toolkit.require";
import path from "node:path";
import ts, * as _ts from "typescript";
export const typescript = _ts;
export const TsNamespace = ts;
export const getTscPath = () => {
  return path.resolve(require.resolve("typescript"), "../tsc.js");
};
