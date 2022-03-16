import type { ModuleFormat } from "rollup";
export const libFormat = (process.argv.find((arg) => arg.startsWith("--format="))?.split("=")[1] ??
  "esm") as ModuleFormat;
export const extension =
  {
    es: ".mjs",
    esm: ".mjs",
    module: ".mjs",
    cjs: ".cjs",
    commonjs: ".cjs",
    umd: ".js",
    system: ".js",
    systemjs: ".js",
    iife: ".js",
    amd: ".js",
  }[libFormat] || ".js";
