import type { InputOption, ModuleFormat } from "rollup";
import { defineConfig } from "vite";
import { extension, getExternalOption, getShebangPlugin } from "../bfsp/vite.config";

const libFormat = (process.argv.find((arg) => arg.startsWith("--format="))?.split("=")[1] ?? "esm") as ModuleFormat;

export const defaultInput: InputOption = {
  index: "src/index.ts",
  "bfsw.bin": "bin/bfsw.cmd.ts",
};

export const scriptInput: InputOption = {
  postinstall: "postinstall.ts",
};

export default defineConfig((info) => {
  const { mode } = info;
  let modeOutDir = "main";
  let modeInput = defaultInput;
  if (mode === "script") {
    modeInput = scriptInput;
    modeOutDir = "script";
  }

  return {
    build: {
      target: "es2020",
      outDir: "dist/" + modeOutDir,
      rollupOptions: {
        preserveEntrySignatures: "strict",
        external: getExternalOption(),
        input: modeInput,
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
