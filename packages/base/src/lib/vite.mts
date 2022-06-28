import fs from "node:fs";
import path from "node:path";
import { require } from "../toolkit/commonjs_require.mjs";
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
    walkFiles(path.dirname(path.dirname(require.resolve("vite"))));
    _vite = require("vite") as $Vite;
  }
  return _vite;
};

export const defineViteStdoutApis = (apis: { writeLine: (log: string) => void; clearLine: () => void }) => {
  Reflect.set(globalThis, "viteWriteLine", apis.writeLine);
  Reflect.set(globalThis, "viteClearLine", apis.clearLine);
};

export type { InlineConfig, LogErrorOptions, Logger, LoggerOptions, LogLevel, LogType } from "vite";
