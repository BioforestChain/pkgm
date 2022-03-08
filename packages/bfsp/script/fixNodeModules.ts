import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
export const fixNodeModules = async () => {
  const __filename = url.fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  let pkgDirname = __dirname;
  let pkgFilename: string;
  do {
    pkgFilename = path.join(pkgDirname, "./package.json");
    /// 寻找存在package.json的路径
    if (fs.existsSync(pkgFilename)) {
      break;
    }

    const upPkgFilename = path.dirname(pkgDirname);
    if (upPkgFilename === pkgDirname) {
      throw new Error("No found package.json file");
    }
    pkgDirname = upPkgFilename;
  } while (true);
  const require = createRequire(import.meta.url);

  const pkgJson = JSON.parse(fs.readFileSync(pkgFilename, "utf8"));
  const bfchainDeps = Object.keys(pkgJson.dependencies).filter((depName) => depName.startsWith("@bfchain/"));
  if (bfchainDeps.length === 0) {
    return;
  }

  const nmBfchainDirname = path.dirname(path.dirname(require.resolve(path.join(bfchainDeps[0]!, "/package.json"))));
  console.group("fixing " + nmBfchainDirname);
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
    console.log("fixed %s", packageJson.name);
  }
  console.groupEnd();
};
