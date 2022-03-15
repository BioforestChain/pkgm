import chalk from "chalk";
import cp, { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { folderIO, getBfspVersion } from "../src";
import { defaultIgnores } from "../src/configs/commonIgnore";
import { ts } from "./fmt.core";
import { writeJsonConfig } from "./util";
import { doInit } from "./init.core";

export const doCreate = async (
  options: { root: string; name: string; license?: string },
  logger: PKGM.ConsoleLogger = console
) => {
  const { root, name, license = "MIT" } = options;
  folderIO.tryInit(root);
  const version = getBfspVersion();
  const packageJson = {
    name,
    version: "1.0.0",
    license,
    scripts: {
      dev: "bfsp dev",
    },
    devDependencies: {
      "@bfchain/pkgm-bfsp": `${version}`,
    },
  };
  logger.log(`creating files`);
  await writeJsonConfig(path.join(root, "package.json"), packageJson);
  const bfspTsFile = ts`
  import { defineConfig } from "@bfchain/pkgm-bfsp";
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
  await writeFile(path.join(root, ".gitignore"), [...defaultIgnores.values()].join("\n"));
  await writeFile(path.join(root, "#bfsp.ts"), bfspTsFile);

  const g = spawn("git", ["init"], { cwd: root, stdio: "pipe" });
  if (logger.isSuperLogger) {
    g.stdout && logger.warn.pipeFrom!(g.stdout);
    g.stderr && logger.error.pipeFrom!(g.stderr);
  } else {
    g.stdout?.pipe(process.stdout);
    g.stderr?.pipe(process.stderr);
  }
  await doInit({ root }, logger);
  logger.log(`project inited, run the following commands to start dev\n`);
  const relative_path = path.relative(process.cwd(), root);
  if (relative_path) {
    logger.log.line!(chalk.blue(`cd ${relative_path}`));
  }
  logger.log(chalk.blue(`bfsp dev`));
  process.exit(0);
};
