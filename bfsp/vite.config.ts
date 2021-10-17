import { defineConfig } from "vite";
import type { InputOption, ModuleFormat } from "rollup";
import { existsSync, statSync } from "node:fs";

const libFormat = (process.argv.find((arg) => arg.startsWith("--format="))?.split("=")[1] ?? "esm") as ModuleFormat;

export const input: InputOption = {
  index: "src/index.ts",
  "bfsp.bin": "bin/bfsp.bin.ts",
  "fmt.bin": "bin/fmt.bin.ts",
  "test.bin": "bin/test.bin.ts",
  "config.test": "tests/config.test.ts",
  bin: "bin.ts",
  test: "test.ts",
  tsc: "bin/tsc.ts",
};
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

export default defineConfig((info) => {
  return {
    build: {
      target: "es2020",
      rollupOptions: {
        preserveEntrySignatures: "strict",
        external: (source, importer, isResolved) => {
          if (source.startsWith("node:")) {
            return true;
          }
          if (source.startsWith("@bfchain/") || source.includes("node_modules/@bfchain/")) {
            return false;
          }
          if (source.includes("node_modules")) {
            return true;
          }
          if (!source.startsWith(".")) {
            if (existsSync(`node_modules/${source}`)) {
              return true;
            }
          }
          console.log("include", source);
        },
        input,
        output: {
          entryFileNames: `[name]${extension}`,
          chunkFileNames: `chunk/[name]${extension}`,
          format: libFormat,
        },
      },
    },
  };
});
