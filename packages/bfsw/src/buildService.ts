import { BuildService, createTscLogger, Loopable, walkFiles } from "@bfchain/pkgm-bfsp";
import { isFileBelongs, states, watchMulti } from "./watcher";
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
          let pass = false;
          if (dirFilter) {
            pass = await dirFilter(dirpath);
          }
          return isFileBelongs(dirpath, fullDirpath);
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
