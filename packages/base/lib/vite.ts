import fs from "node:fs";
import path from "node:path";
import { require } from "../src/toolkit.require";
const walkFiles = (dir: string) => {
  for (const item of fs.readdirSync(dir)) {
    const filepath = path.join(dir, item);
    if (fs.statSync(filepath).isDirectory()) {
      walkFiles(filepath);
    } else if (filepath.endsWith(".js")) {
      const fileContent = fs.readFileSync(filepath, "utf-8");
      if (fileContent.includes("function writeLine(")) {
        const hackFileContent = fileContent
          .replace("function writeLine(", "function stdoutWriteLine(")
          .replace(/\swriteLine\(/g, " (globalThis.viteWriteLine||stdoutWriteLine)(");
        fs.writeFileSync(filepath, hackFileContent);
      }
    }
  }
};
walkFiles(path.dirname(path.dirname(require.resolve("vite"))));
export const { build } = require("vite") as typeof import("vite");

export const defineViteWriteLine = (writeLine: (log: string) => void) => {
  Reflect.set(globalThis, "viteWriteLine", writeLine);
};
export type { InlineConfig, LogErrorOptions, Logger, LoggerOptions, LogLevel, LogType } from "vite";
