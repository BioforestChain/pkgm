import { defineConfig } from "vite";
import type { InputOption, ModuleFormat } from "rollup";

const libFormat = (process.argv
  .find((arg) => arg.startsWith("--format="))
  ?.split("=")[1] ?? "esm") as ModuleFormat;

export const input: InputOption = {
  index: "src/index.ts",
  "dev.bin": "bin/dev.ts",
  "fmt.bin": "bin/fmt.ts",
  "test.bin": "bin/test.ts",
  "config.test": "test/config.test.ts",
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
      //   lib: {
      //     entry: input.index,
      //     formats: ["es"],
      //   },
      rollupOptions: {
        preserveEntrySignatures: "strict",
        external: [/^node:.*/, "vite", "esbuild", "*"],
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
