import { defaultIgnores, doCreateBfsp, folderIO, ts, writeJsonConfig } from "@bfchain/pkgm-bfsp";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { joinMonoName } from "../src/util";

export const doCreateBfsw = async (options: { root: string; name: string; license?: string }, logger: PKGM.Logger) => {
  const { root, name, license = "MIT" } = options;

  folderIO.tryInit(root);

  let projectName = name;
  const idx = name.lastIndexOf("/");
  if (idx >= 0) {
    projectName = name.substring(idx);
  }

  const bfswTsFile = ts`
  import { defineWorkspace } from "@bfchain/pkgm-bfsw";
  import typingsProject from "./packages/typings/#bfsp";
  export default defineWorkspace(() => {
    const config: Bfsw.Workspace = {
      projects: [typingsProject],
    };
    return config;
  });
  `;
  await writeFile(path.join(root, "#bfsw.ts"), bfswTsFile);
  await writeJsonConfig(path.join(root, "package.json"), {
    name: `${name}~workspace`,
    private: true,
    workspaces: ["packages/*"],
  });
  await writeFile(path.join(root, ".gitignore"), [...defaultIgnores.values()].join("\n"));

  await doCreateBfsp(
    {
      ...options,
      name: joinMonoName(name, "typings"),
      root: path.join(root, "packages/typings"),
      skipGit: true,
    },
    logger
  );

  // folderIO.tryInit(path.join(root, name));

  // const packageJson = {
  //   name,
  //   version: "1.0.0",
  //   license,
  //   scripts: {
  //     dev: "bfsw dev",
  //   },
  // };
  // logger.log(`creating files`);
  // await writeJsonConfig(path.join(root, name, "package.json"), packageJson);
  // const bfspTsFile = ts`
  // import { defineConfig } from "@bfchain/pkgm-bfsp";
  // export default defineConfig((info) => {
  //   const config: Bfsp.UserConfig = {
  //     name: "${name}",
  //     exports: {
  //       ".": "./index.ts",
  //     },
  //   };
  //   return config;
  // });
  // `;
  // await writeFile(path.join(root, name, "index.ts"), `export {}`);
  // await writeFile(path.join(root, name, ".gitignore"), [...defaultIgnores.values()].join("\n"));
  // await writeFile(path.join(root, name, "#bfsp.ts"), bfspTsFile);

  // const g = spawn("git", ["init"], { cwd: root });
  // if (logger.isSuperLogger) {
  //   g.stdout && logger.warn.pipeFrom!(g.stdout);
  //   g.stderr && logger.error.pipeFrom!(g.stderr);
  // } else {
  //   g.stdout?.pipe(process.stdout);
  //   g.stderr?.pipe(process.stderr);
  // }
  // await doInit({ root }, logger);
  // logger.log(`workspace inited, run the following commands to start dev\n`);
  // const relative_path = path.relative(process.cwd(), root);
  // if (relative_path) {
  //   logger.log!(chalk.blue(`cd ${relative_path}`));
  // }
  // logger.log(chalk.blue(`bfsw dev`));
  // process.exit(0);
};
