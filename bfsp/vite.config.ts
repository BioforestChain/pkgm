import { defineConfig } from "vite";
import type { InputOption, ModuleFormat } from "rollup";

const libFormat = (process.argv
  .find((arg) => arg.startsWith("--format="))
  ?.split("=")[1] ?? "esm") as ModuleFormat;

export const input: InputOption = {
  index: "src/index.ts",
  "dev.bin": "bin/dev.bin.ts",
  "fmt.bin": "bin/fmt.bin.ts",
  "test.bin": "bin/test.bin.ts",
  "config.test": "tests/config.test.ts",
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
        external: [
          /^node:.*/,
          "vite",
          "esbuild",
          "rollup",
          "typescript",
          "ava",
          "*",
        ],
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
