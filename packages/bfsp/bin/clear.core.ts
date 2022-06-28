import fs from "node:fs";
import path from "node:path";

export const doClearBfsp = async (options: { root: string }, logger: PKGM.Logger) => {
  const { root } = options;
  const bfspDir = path.join(root, ".bfsp");
  logger.info("removing .bfsp %s", bfspDir);
  fs.rmSync(bfspDir, { recursive: true });
};
