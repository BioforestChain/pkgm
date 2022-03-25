import { require } from "../src/toolkit.require";
import path from "node:path";
import type $Typescript from "typescript";
export const getTypescript = () => {
  return import("typescript");
};
export { $Typescript };
export const getTscPath = () => {
  return path.resolve(require.resolve("typescript"), "../tsc.js");
};
