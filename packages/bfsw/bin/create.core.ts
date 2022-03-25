import { defaultIgnores, doCreateBfsp, doInitGit, folderIO, ts, writeJsonConfig } from "@bfchain/pkgm-bfsp";
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

  /// 初始化git仓库
  await doInitGit(root, logger);
};
