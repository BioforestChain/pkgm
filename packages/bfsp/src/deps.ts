import { isDeepStrictEqual } from "node:util";
import { runYarn } from "../bin/yarn/runner";
import { $PackageJson } from "./configs/packageJson";
import { Debug } from "./logger";
import { Loopable, SharedAsyncIterable, SharedFollower } from "./toolkit";
import { getTui } from "./tui";

const log = Debug("bfsp:deps");

export const watchDeps = (
  projectDirpath: string,
  packageJsonStream: SharedAsyncIterable<$PackageJson>,
  options?: { runYarn: boolean }
) => {
  const depsPanel = getTui().getPanel("Deps");
  let curDeps = {};
  const follower = new SharedFollower<boolean>();
  let stoppable: { stop: () => void } | undefined;
  const looper = Loopable("watch deps", async () => {
    const packageJson = await packageJsonStream.getCurrent();
    if (isDeepStrictEqual(packageJson.dependencies, curDeps)) {
      return;
    }
    curDeps = packageJson.dependencies;
    if (options?.runYarn) {
      log(`deps changed: ${projectDirpath}`);
      depsPanel.updateStatus("loading");
      stoppable = runYarn({
        root: projectDirpath,
        onMessage: (s) => depsPanel.write(s),
        onExit: () => {
          follower.push(true);
        },
      });
    } else {
      follower.push(true);
    }
  });

  //#region 监听变更
  packageJsonStream.onNext(() => {
    if (stoppable) {
      stoppable.stop();
      stoppable = undefined;
    }
    looper.loop();
  });
  //#endregion

  return new SharedAsyncIterable<boolean>(follower);
};
