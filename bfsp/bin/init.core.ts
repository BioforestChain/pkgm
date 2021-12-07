import chalk from "chalk";
import path from "node:path";
import { fileIO, folderIO } from "../src";
import cp from "node:child_process";
import { writeFile } from "node:fs/promises";
import { destroyScreen } from "../src/logger";

export const doInit = async (options: { root: string; name: string; license?: string }) => {
  const { root, name, license = "MIT" } = options;
  console.log(options);
  destroyScreen();
  folderIO.tryInit(root);
  const packageJson = {
    name,
    version: "1.0.0",
    license,
    scripts: {
      dev: "bfsp dev",
    },
  };
  console.log(`creating files`);
  await writeFile(path.join(root, "package.json"), JSON.stringify(packageJson, null, 2));
  const bfspTsFile = `
  import { defineConfig } from "@bfchain/pkgm";
  export default defineConfig((info) => {
  const config: Bfsp.UserConfig = {
    name: "${name}",
    exports: {
      ".": "./index.ts",
    },
  };
  return config;
});
  `;
  await writeFile(path.join(root, "index.ts"), `export {}`);
  await writeFile(path.join(root, "#bfsp.ts"), bfspTsFile);
  console.log("linking dependencies");
  const proc = cp.exec("yarn add -D @bfchain/pkgm", { cwd: root });
  proc.stdout?.on("data", (data) => process.stdout.write(data));
  proc.stderr?.on("data", (data) => process.stderr.write(data));

  proc.on("exit", (e) => {
    console.log(`project inited, run the following commands to start dev\n`);
    const relative_path = path.relative(process.cwd(), root);
    if (relative_path) {
      console.log(chalk.blue(`cd ${relative_path}`));
    }
    console.log(chalk.blue(`bfsp dev`));
    process.exit(0);
  });
};
