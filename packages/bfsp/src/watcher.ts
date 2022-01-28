import chokidar from "chokidar";
import path from "node:path";
import { readUserConfig } from "./configs/bfspUserConfig";
import { Loopable, SharedAsyncIterable, SharedFollower } from "./toolkit";

/// single

export function watchSingle() {
  const watchTs = (root: string, cb: (p: string, type: Bfsp.WatcherAction) => void) => {
    const watcher = chokidar.watch(
      ["assets/**/*.json", "**/*.ts", "**/*.tsx", "**/*.cts", "**/*.mts", "**/*.ctsx", "**/*.mtsx"],
      {
        cwd: root,
        ignoreInitial: false,
        followSymlinks: true,
        ignored: ["*.d.ts", ".bfsp", "#bfsp.ts", "node_modules"],
      }
    );
    watcher.on("add", (p) => cb(p, "add"));
    watcher.on("unlink", (p) => cb(p, "unlink"));
    watcher.on("change", (p) => cb(p, "change"));
  };
  const watchUserConfig = (root: string, cb: (p: string, type: Bfsp.WatcherAction) => void) => {
    const watcher = chokidar.watch(["#bfsp.json", "#bfsp.ts", "#bfsp.mts", "#bfsp.mtsx"], {
      cwd: root,
      ignoreInitial: false,
    });
    watcher.on("add", (p) => cb(p, "add"));
    watcher.on("unlink", (p) => cb(p, "unlink"));
    watcher.on("change", (p) => cb(p, "change"));
  };
  return {
    watchTs,
    watchUserConfig,
  } as Bfsp.AppWatcher;
}
