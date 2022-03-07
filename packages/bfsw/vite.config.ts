import type { InputOption, ModuleFormat } from "rollup";
import { defineConfig } from "vite";
import { extension, getExternalOption, getShebangPlugin } from "../bfsp/vite.config";

const libFormat = (process.argv.find((arg) => arg.startsWith("--format="))?.split("=")[1] ?? "esm") as ModuleFormat;

export const input: InputOption = {
  index: "src/index.ts",
  "bfsw.bin": "bin/bfsw.cmd.ts",
};

export default defineConfig((info) => {
  return {
    build: {
      target: "es2020",
      rollupOptions: {
        preserveEntrySignatures: "strict",
        external: getExternalOption(),
        input,
        output: {
          entryFileNames: `[name]${extension}`,
          chunkFileNames: `chunk/[name]${extension}`,
          format: libFormat,
        },
      },
    },
    plugins: [getShebangPlugin(__dirname)],
  };
});
