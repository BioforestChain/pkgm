import chalk from "chalk";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { folderIO, getBfswVersion } from "@bfchain/pkgm-bfsp";
import { defaultIgnores } from "@bfchain/pkgm-bfsp";
import { ts } from "@bfchain/pkgm-bfsp";
import { writeJsonConfig } from "@bfchain/pkgm-bfsp";
import { doInit } from "./init.core";

export const doCreate = async (options: { root: string; name: string; license?: string }) => {
  const { root, name, license = "MIT" } = options;

  folderIO.tryInit(root);

  let projectName = name;
  const idx = name.lastIndexOf("/");
  if (idx >= 0) {
    projectName = name.substring(idx);
  }

  const bfswTsFile = ts`
  import { defineWorkspace } from "@bfchain/pkgm-bfsw";
  import project from "./${name}/#bfsp";
  export default defineWorkspace(() => {
    const config: Bfsp.Workspace = {
      projects: [project],
    };
    return config;
  });
  `;
  await writeFile(path.join(root, "#bfsw.ts"), bfswTsFile);
  const version = getBfswVersion();
  await writeJsonConfig(path.join(root, "package.json"), {
    name: "bfsp-workspace",
    private: true,
    workspaces: [],
    devDependencies: {
      "@bfchain/pkgm-bfsw": `^${version}`,
    },
  });
  await writeFile(path.join(root, ".gitignore"), [...defaultIgnores.values()].join("\n"));

  folderIO.tryInit(path.join(root, name));

  const packageJson = {
    name,
    version: "1.0.0",
    license,
    scripts: {
      dev: "bfsw dev",
    },
  };
  console.log(`creating files`);
  await writeJsonConfig(path.join(root, name, "package.json"), packageJson);
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
  await writeFile(path.join(root, name, "index.ts"), `export {}`);
  await writeFile(path.join(root, name, ".gitignore"), [...defaultIgnores.values()].join("\n"));
  await writeFile(path.join(root, name, "#bfsp.ts"), bfspTsFile);

  const g = spawn("git", ["init"], { cwd: root });
  g.stdout?.pipe(process.stdout);
  g.stderr?.pipe(process.stderr);
  await doInit({ root });
  console.log(`workspace inited, run the following commands to start dev\n`);
  const relative_path = path.relative(process.cwd(), root);
  if (relative_path) {
    console.log(chalk.blue(`cd ${relative_path}`));
  }
  console.log(chalk.blue(`bfsw dev`));
  process.exit(0);
};
