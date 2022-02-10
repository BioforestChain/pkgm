import chokidar from "chokidar";
import { Loopable, SharedAsyncIterable, walkFiles } from ".";

type TsReference = { path: string };
export interface BuildService {
  watcher: Bfsp.AppWatcher;
  walkFiles: typeof walkFiles;
  updateTsConfigStream(looper: ReturnType<typeof Loopable>): void;
  updateUserConfigStream(looper: ReturnType<typeof Loopable>): void;
  calculateRefsByPath(p: string): Promise<TsReference[]>;
  afterSingleBuild(options: { buildOutDir: string; config: Bfsp.UserConfig }): Promise<void>;
  rollup?: {
    isExternal(source: string, importer: string | undefined, isResolved: boolean): boolean;
  };
}
export function getBfspBuildService(watcher: Bfsp.AppWatcher): BuildService {
  return {
    watcher,
    walkFiles,
    updateTsConfigStream(looper: ReturnType<typeof Loopable>) {},
    updateUserConfigStream(looper: ReturnType<typeof Loopable>) {},
    async calculateRefsByPath(p: string) {
      return [];
    },
    async afterSingleBuild(options: { buildOutDir: string; config: Bfsp.UserConfig }) {},
  };
}
