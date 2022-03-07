import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { BuildService, Loopable, walkFiles } from "@bfchain/pkgm-bfsp";
import { symlink, unlink, stat, mkdir } from "node:fs/promises";
import { getRoot, isFileBelongs, states, watchMulti } from "./watcher";

export async function createSymlink(root: string, name: string, outDir: string) {
  const symlinkType = os.platform() === "win32" ? "junction" : "dir";
  const symlinkTarget = path.join(root, "node_modules", name);
  if (fs.existsSync(symlinkTarget)) {
    const s = await stat(symlinkTarget);
    await unlink(symlinkTarget);
  }
  const symlinkTargetDirName = path.dirname(symlinkTarget);
  if (!fs.existsSync(symlinkTargetDirName)) {
    await mkdir(symlinkTargetDirName, { recursive: true });
  }
  await symlink(outDir, symlinkTarget, symlinkType);
}
export function getBfswBuildService(watcher: Bfsp.AppWatcher): BuildService {
  return {
    watcher,
    walkFiles(
      dirpath: string,
      opts: {
        dirFilter?: (dirpath: string) => BFChainUtil.PromiseMaybe<boolean>;
        refreshCache?: boolean;
      } = {}
    ) {
      const { dirFilter } = opts;

      return walkFiles(dirpath, {
        ...opts,
        dirFilter: async (fullDirpath) => {
          let pass = true;
          if (dirFilter) {
            pass = await dirFilter(dirpath);
          }
          return pass && isFileBelongs(dirpath, fullDirpath);
        },
      });
    },
    updateTsConfigStream(looper: ReturnType<typeof Loopable>) {
      const multiStream = watchMulti();
      multiStream.onNext(() => looper.loop);
    },
    updateUserConfigStream(looper: ReturnType<typeof Loopable>) {
      const multiStream = watchMulti();
      multiStream.onNext(() => looper.loop);
    },
    async calculateRefsByPath(p: string) {
      return await states.calculateRefsByPath(p);
    },
    async afterSingleBuild(options: { buildOutDir: string; config: Bfsp.UserConfig }) {
      const root = getRoot();
      await createSymlink(root, options.config.name, options.buildOutDir);
    },
    rollup: {
      isExternal(source: string, importer: string, isResolved: boolean) {
        // 子包标记为外部
        // 这里只取了userConfig.name , 并没有收集build字段里的name的原因是
        // 在子包开发的过程中，通常会把多平台的逻辑冒泡到最外层，所以只有最外层才会有build字段
        const subProjectNames = states.userConfigs().map((x) => x.name);
        return subProjectNames.some((x) => source.startsWith(x));
      },
    },
  };
}
