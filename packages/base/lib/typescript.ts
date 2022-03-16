import { require } from "../src/toolkit.require";
import path from "node:path";
import typescript from "typescript";
export { typescript };
export const getTscPath = () => {
  return path.resolve(require.resolve("typescript"), "../tsc.js");
};
