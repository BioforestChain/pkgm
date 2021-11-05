import chalk from "chalk";
import path from "node:path";
import { fileIO, folderIO } from "../src";
import cp from "node:child_process";
import { writeFile } from "node:fs/promises";
import { destroyScreen } from "../src/logger";

export const doInit = async (options: { root: string; name: string }) => {
  const { root, name } = options;
  destroyScreen();
  folderIO.tryInit(root);
  const packageJson = {
    name,
    version: "1.0.0",
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

  proc.on("exit", (e) => {
    console.log(`project inited, run the following commands to start dev\n`);
    console.log(chalk.blue(`cd ${name}`));
    console.log(chalk.blue(`bfsp dev`));
    process.exit(0);
  });
};
