import { closeSync, existsSync, openSync, readFileSync, writeSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { InputOption, ModuleFormat } from "rollup";
import { defineConfig } from "vite";

const libFormat = (process.argv.find((arg) => arg.startsWith("--format="))?.split("=")[1] ?? "esm") as ModuleFormat;

export const input: InputOption = {
  index: "src/index.ts",
  bin: "bin.ts",
  test: "test.ts",
  "bfsw.bin":"bin/multi/bfsw.cmd.ts",
  "bfsp.bin": "bin/bfsp.cmd.ts",
  "config.test": "tests/config.test.ts",
  "build.test": "tests/build.test.ts",
  "util.test": "tests/util.test.ts",
  tsc_worker: "bin/tsc/worker.ts",
  ava_worker: "bin/ava/worker.ts",
  terser_worker: "bin/terser/worker.ts",
  yarn_worker: "bin/yarn/worker.ts",
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
    plugins: [
      {
        name: "shebang",
        banner: async () => {},
        closeBundle: async () => {
          // const __filename = fileURLToPath(import.meta.url);
          // console.log(__filename)
          // const __dirname = path.dirname(__filename);
          const packageJsonPath = path.resolve(__dirname, "./package.json");
          const packageJson = new Function(`return ${readFileSync(packageJsonPath, "utf-8")}`)();
          const bin = packageJson.bin;
          if (!(typeof bin === "object" && bin)) {
            return;
          }
          for (const binname in bin) {
            const binFilepath = path.resolve(__dirname, bin[binname]);
            writeFileSync(binFilepath, "#!/usr/bin/env node\n" + readFileSync(binFilepath));
            console.log(`inserted shebang to ${binFilepath}`);
          }
        },
      },
    ],
  };
});
