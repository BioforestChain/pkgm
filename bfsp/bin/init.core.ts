import chalk from "chalk";
import path from "node:path";
import { fileIO, folderIO } from "../src";
import { exec, spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { getYarnPath, writeJsonConfig } from "./util";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { defaultIgnores } from "../src/configs/commonIgnore";
import { tui } from "../src/tui";
import { ts } from "./fmt.core";

export const doInit = async (options: { root: string; name: string; license?: string }) => {
  const { root, name, license = "MIT" } = options;
  tui.destory();
  folderIO.tryInit(root);

  await writeJsonConfig(path.join(root, "package.json"), { name: "bfsp-workspace", private: true, workspaces: [] });
  await writeFile(path.join(root, ".gitignore"), [...defaultIgnores.values()].join("\n"));

  folderIO.tryInit(path.join(root, name));

  const packageJson = {
    name,
    version: "1.0.0",
    license,
    scripts: {
      dev: "bfsp dev",
    },
  };
  console.log(`creating files`);
  await writeJsonConfig(path.join(root, name, "package.json"), packageJson);
  const bfspTsFile = ts`
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
  await writeFile(path.join(root, name, "index.ts"), `export {}`);
  await writeFile(path.join(root, name, ".gitignore"), [...defaultIgnores.values()].join("\n"));
  await writeFile(path.join(root, name, "#bfsp.ts"), bfspTsFile);
  console.log("linking dependencies");

  let yarnPath = getYarnPath();
  if (!existsSync(yarnPath)) {
    console.log(`missing package ${chalk.blue("yarn")}`);
    process.exit();
  }

  const g = spawn("git", ["init"], { cwd: root });
  g.stdout?.pipe(process.stdout);
  g.stderr?.pipe(process.stderr);
  const proc = spawn("node", [yarnPath, "add", "-D", "-W", "@bfchain/pkgm"], { cwd: root });
  proc.stdout?.pipe(process.stdout);
  proc.stderr?.pipe(process.stderr);

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
