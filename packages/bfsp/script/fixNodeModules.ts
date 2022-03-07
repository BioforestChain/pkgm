import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
export const fixNodeModules = async (rootPackName: string = "@bfchain/pkgm-bfsp") => {
  const require = createRequire(import.meta.url);
  const pkgDirname = path.dirname(require.resolve(rootPackName + "/package.json"));
  const nmBfchainDirname = path.resolve(pkgDirname, "node_modules/@bfchain");
  for (const pkgName of fs.readdirSync(nmBfchainDirname)) {
    const packageJsonFilepath = path.join(nmBfchainDirname, pkgName, "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonFilepath, "utf-8"));
    if (packageJson.type !== "module" && packageJson.exports === undefined) {
      if (!packageJson.types) {
        packageJson.types = packageJson.type;
      }
      packageJson.type = "module";
      packageJson.exports = {
        ".": {
          require: packageJson.main.startsWith("./") ? packageJson.main : "./" + packageJson.main,
          import: packageJson.module.startsWith("./") ? packageJson.module : "./" + packageJson.module,
        },
      };
      fs.writeFileSync(packageJsonFilepath, JSON.stringify(packageJson, null, 2));
    }
  }
};
