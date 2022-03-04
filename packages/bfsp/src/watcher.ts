import { getWatcher } from "./toolkit.watcher";

export function watchSingle() {
  const watchTs = async (root: string, cb: (p: string, type: Bfsp.WatcherAction) => void) => {
    const watcher = await getWatcher(root);
    watcher.doWatch(
      {
        expression: [
          "allof",
          ["match", "*.ts", "wholename"],
          ["match", "*.tsx", "wholename"],
          ["match", "*.cts", "wholename"],
          ["match", "*.mts", "wholename"],
          ["match", "*.ctsx", "wholename"],
          ["match", "*.mtsx", "wholename"],
          ["not", ["match", "**/node_modules/**", "wholename"]],
          ["not", ["match", "**/.*/**", "wholename"]],
        ],
        chokidar: [
          ["assets/**/*.json", "**/*.ts", "**/*.tsx", "**/*.cts", "**/*.mts", "**/*.ctsx", "**/*.mtsx"],
          {
            cwd: root,
            ignoreInitial: false,
            followSymlinks: true,
            ignored: ["*.d.ts", ".bfsp", "#bfsp.ts", "node_modules"],
          },
        ],
      },
      cb
    );
  };
  const watchUserConfig = async (root: string, cb: (p: string, type: Bfsp.WatcherAction) => void) => {
    const watcher = await getWatcher(root);
    watcher.doWatch(
      {
        expression: [
          "allof",
          ["name", ["#bfsp.json", "#bfsp.ts", "#bfsp.mts", "#bfsp.mtsx"]],
          ["not", ["match", "**/node_modules/**", "wholename"]],
          ["not", ["match", "**/.*/**", "wholename"]],
        ],
        chokidar: [
          ["#bfsp.json", "#bfsp.ts", "#bfsp.mts", "#bfsp.mtsx"],
          {
            cwd: root,
            ignoreInitial: false,
          },
        ],
      },
      cb
    );
  };
  return {
    watchTs,
    watchUserConfig,
  } as Bfsp.AppWatcher;
}
