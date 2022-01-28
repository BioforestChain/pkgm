import chokidar from "chokidar";
import { Loopable, SharedAsyncIterable, walkFiles } from ".";

export interface BuildService {
  watcher: Bfsp.AppWatcher;
  walkFiles: typeof walkFiles;
  updateTsConfigStream(looper: ReturnType<typeof Loopable>): void;
  updateUserConfigStream(looper: ReturnType<typeof Loopable>): void;
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
  };
}
