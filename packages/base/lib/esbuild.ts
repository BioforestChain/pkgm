import fs from "node:fs";
import path from "node:path";
import { require } from "../src/toolkit.require";

const walkFiles = (dir: string) => {
  for (const item of fs.readdirSync(dir)) {
    const filepath = path.join(dir, item);
    if (fs.statSync(filepath).isDirectory()) {
      walkFiles(filepath);
    } else if (filepath.endsWith("main.js")) {
      let fileContent = fs.readFileSync(filepath, "utf-8");
      let changed = false;
      if (fileContent.includes("inherit")) {
        fileContent = fileContent.replace("inherit", "ignore");
        changed = true;
      }
      if (changed) {
        fs.writeFileSync(filepath, fileContent);
      }
    }
  }
};

export type $Esbuild = typeof import("esbuild");
let _esb: $Esbuild | undefined;
export const getEsbuild = () => {
  if (_esb === undefined) {
    walkFiles(path.dirname(path.dirname(require.resolve("esbuild"))));
    _esb = require("esbuild") as $Esbuild;
  }
  return _esb;
};
export const { build } = getEsbuild();
export type { Loader, Plugin } from "esbuild";
