/// <reference path="../../typings/acorn-import-assertions.d.ts"/>
import fs from "node:fs";
import path from "node:path";
import { require } from "../toolkit/toolkit.require.mjs";

const walkFiles = (dir: string) => {
  for (const item of fs.readdirSync(dir)) {
    const filepath = path.join(dir, item);
    if (fs.statSync(filepath).isDirectory()) {
      walkFiles(filepath);
    } else if (filepath.endsWith(".js")) {
      let fileContent = fs.readFileSync(filepath, "utf-8");
      let changed = false;
      if (fileContent.includes("function writeLine(")) {
        fileContent = fileContent
          .replace("function writeLine(", "function stdoutWriteLine(")
          .replace(/\swriteLine\(/g, " (globalThis.viteWriteLine||stdoutWriteLine)(");
        changed = true;
      }
      if (fileContent.includes(`process.stdout.clearLine(0);`) && fileContent.includes("stdoutClearLine") === false) {
        fileContent =
          `function stdoutClearLine () { process.stdout.clearLine(0); process.stdout.cursorTo(0); };\n` +
          fileContent.replace(
            /process\.stdout\.clearLine\(0\);[\s\n]*process\.stdout\.cursorTo\(0\);/g,
            "(globalThis.viteClearLine||stdoutClearLine)()"
          );
        changed = true;
      }
      if (changed) {
        fs.writeFileSync(filepath, fileContent);
      }
    }
  }
};
export type $Vite = typeof import("vite");
let _vite: $Vite | undefined;
export const getVite = () => {
  if (_vite === undefined) {
    // 目录层级不对，导致typescript包也被替换了
    // walkFiles(path.dirname(path.dirname(require.resolve("vite"))));
    walkFiles(path.dirname(require.resolve("vite")));
    _vite = require("vite") as $Vite;
  }
  return _vite;
};

export const defineViteStdoutApis = (apis: { writeLine: (log: string) => void; clearLine: () => void }) => {
  Reflect.set(globalThis, "viteWriteLine", apis.writeLine);
  Reflect.set(globalThis, "viteClearLine", apis.clearLine);
};

export type { InlineConfig, LogErrorOptions, Logger, LoggerOptions, LogLevel, LogType } from "vite";

import { getExternalOption } from "../vite-config-helper/external.mjs";
import { extension, libFormat } from "../vite-config-helper/extension.mjs";

import { importAssertionsPlugin } from "rollup-plugin-import-assert";
import { importAssertions } from "acorn-import-assertions";

export const genRollupOptions = async (input: { [name: string]: string }, dirname: string) => {
  return {
    preserveEntrySignatures: "strict",
    external: await getExternalOption(dirname),
    input: input,
    output: {
      /// 单个文件模块就算了
      preserveModules: false, // Object.keys(input).length === 1 ? false : true,
      manualChunks: undefined,
      entryFileNames: `[name]${extension}`,
      chunkFileNames: `chunk/[name]${extension}`,
      format: libFormat,
    },
    acornInjectPlugins: [importAssertions],
    plugins: [importAssertionsPlugin()],
  };
};
