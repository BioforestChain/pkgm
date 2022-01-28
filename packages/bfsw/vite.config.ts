import { closeSync, existsSync, openSync, readFileSync, writeSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { InputOption, ModuleFormat } from "rollup";
import { defineConfig } from "vite";
import { extension, getShebangPlugin } from "../bfsp/vite.config";

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
        external: (source, importer, isResolved) => {
          if (source.startsWith("node:")) {
            return true;
          }
          if (source.startsWith("@bfchain/pkgm-bfsp") || source.includes("node_modules/@bfchain/pkgm-bfsp")) {
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
    plugins: [getShebangPlugin(__dirname)],
  };
});
