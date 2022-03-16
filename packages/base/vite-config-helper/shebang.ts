import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { PluginOption } from "vite";
export const getShebangPlugin = (dirname: string) => {
  return {
    name: "shebang",
    banner: async () => {
      return "";
    },
    closeBundle: async () => {
      const packageJsonPath = path.resolve(dirname, "./package.json");
      const packageJson = new Function(`return ${readFileSync(packageJsonPath, "utf-8")}`)();
      const bin = packageJson.bin;
      if (!(typeof bin === "object" && bin)) {
        return;
      }
      for (const binname in bin) {
        const binFilepath = path.resolve(dirname, bin[binname]);
        if (existsSync(binFilepath)) {
          const binFileContent = readFileSync(binFilepath, "utf-8");
          const SHEBANG_PREFIX = "#!/usr/bin/env node\n";
          if (binFileContent.startsWith(SHEBANG_PREFIX) === false) {
            writeFileSync(binFilepath, SHEBANG_PREFIX + binFileContent);
            console.log(`inserted shebang to ${binFilepath}`);
          }
        }
      }
    },
  } as PluginOption;
};
