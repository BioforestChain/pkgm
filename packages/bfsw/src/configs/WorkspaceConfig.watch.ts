import { getWatcher, SharedFollower } from "@bfchain/pkgm-bfsp";

/**
 *
 * @bfsw+bfsp
 */
export const doWorkspaceWatch = async (workspaceRoot: string) => {
  const watcher = await getWatcher(workspaceRoot);
  const follower = new SharedFollower<{ filepath: string; type: Bfsp.WatcherAction }>();

  //#region
  watcher.doWatch(
    {
      expression: [
        "allof",
        [
          "anyof",
          //
          ["name", ["#bfsw.ts", "wholename"]],
          ["name", ["#bfsp.ts", "wholename"]],
        ],
        ["not", ["match", "**/node_modules/**", "wholename"]],
        ["not", ["match", "**/.*/**", "wholename"]],
      ],
      chokidar: [
        ["#bfsw.ts", "#bfsp.ts"].map((x) => `./**/${x}`),
        { cwd: workspaceRoot, ignoreInitial: true, ignored: [/node_modules*/, /\.bfsp*/] },
      ],
    },
    (filepath, type) => {
      follower.push({ filepath, type });
    }
  );
  //#endregion

  return;
};
