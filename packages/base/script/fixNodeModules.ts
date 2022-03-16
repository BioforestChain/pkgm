import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

export const fixNodeModules = async (__dirname: string) => {
  console.log("dirname", __dirname);
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
  const require = createRequire(__dirname);

  const pkgJson = JSON.parse(fs.readFileSync(pkgFilename, "utf8"));
  const bfchainDeps = Object.keys(Object.assign({}, pkgJson.dependencies, pkgJson.devDependencies)).filter((depName) =>
    depName.startsWith("@bfchain/util")
  );
  if (bfchainDeps.length === 0) {
    return;
  }

  const entry = require.resolve(bfchainDeps[0]!);
  const nmBfchainDirname = path.join(entry.substring(0, entry.lastIndexOf("@bfchain")), "@bfchain");
  console.group("fixing " + nmBfchainDirname);
  for (const pkgName of fs.readdirSync(nmBfchainDirname)) {
    const packageJsonFilepath = path.join(nmBfchainDirname, pkgName, "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonFilepath, "utf-8"));
    if (!packageJson.name.startsWith("@bfchain/util")) {
      // 修复util包
      continue;
    }
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
      console.log("fixed\t%s", packageJson.name);
    } else {
      console.log("checked\t%s", packageJson.name);
    }
  }
  console.groupEnd();
};
