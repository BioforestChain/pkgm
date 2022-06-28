import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { userInfo } from "node:os";
import { existsSync } from "node:fs";
import path from "node:path";
import { folderIO, writeJsonConfig } from "../sdk/toolkit/toolkit.fs.mjs";
import { ts } from "./fmt.core.mjs";

export const doCreateBfsp = async (
  options: { root: string; name: string; license?: string; skipGit?: boolean },
  logger: PKGM.Logger
) => {
  const { root, name, license = "MIT", skipGit = false } = options;
  folderIO.tryInit(root);
  const packageJson = {
    name,
    scripts: {
      dev: "bfsp dev",
    },
  };
  logger.log(`creating files`);
  await writeJsonConfig(path.join(root, "package.json"), packageJson);
  const bfspTsFile = await ts`
  import { defineConfig } from "@bfchain/pkgm-bfsp.mjs";
  export default defineConfig((info) => {
  const config: Bfsp.UserConfig = {
    name: ${JSON.stringify(name)},
    exports: {
      ".": "./index.ts",
    },
    packageJson: {
      license: ${JSON.stringify(license)},
      author: ${JSON.stringify(userInfo().username)}
    }
  };
  return config;
});
  `;
  /// 写入基本的 bfsp 文件
  await writeFile(path.join(root, "#bfsp.ts"), bfspTsFile);
  await writeFile(path.join(root, "index.ts"), `export {}`);

  /// 初始化git仓库
  if (skipGit === false) {
    await doInitGit(root, logger);
  }
};

export const doInitGit = (root: string, logger: PKGM.Logger) => {
  if (existsSync(path.join(root, ".git")) === false) {
    const g = spawn("git", ["init"], { cwd: root, stdio: "pipe" });
    logger.warn.pipeFrom(g.stdout);
    logger.error.pipeFrom(g.stderr);
    return new Promise<number>((resolve) => {
      g.on("exit", (code) => {
        resolve(code ?? 0);
      });
    });
  }
};
