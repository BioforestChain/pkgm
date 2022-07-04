import fs from "node:fs";
import path from "node:path";

export const doClearBfsp = async (args: { root: string }, logger: PKGM.Logger) => {
  const { root } = args;
  logger.group(root);
  {
    const bfspDir = path.join(root, ".bfsp");
    logger.info("removing .bfsp");
    fs.rmSync(bfspDir, { recursive: true });
  }
  {
    const tsconfigFilepath = path.join(root, "tsconfig.json");
    const tsconfigIsolatedFilepath = path.join(root, "tsconfig.isolated.json");
    const tsconfigTypingsFilepath = path.join(root, "tsconfig.typings.json");
    const packageJsonFilepath = path.join(root, "package.json");
    const gitignoreFilepath = path.join(root, ".gitignore");
    const npmignoreFilepath = path.join(root, ".npmignore");
    const yarnLockFilepath = path.join(root, "yarn.lock");
    // yarn.lock 暂时不删除，如果要的话，需要把 node_modules 也一起删掉
    logger.info("removing config files");
    for (const filepath of [
      tsconfigFilepath,
      tsconfigIsolatedFilepath,
      tsconfigTypingsFilepath,
      packageJsonFilepath,
      gitignoreFilepath,
      npmignoreFilepath,
      yarnLockFilepath,
    ]) {
      fs.rmSync(filepath, { /* 避免文件不存在时也报错 */ force: true });
    }
  }
  logger.groupEnd();
};
