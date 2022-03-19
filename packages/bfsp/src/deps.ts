import { isDeepStrictEqual } from "node:util";
import { runYarn } from "../bin/yarn/runner";
import { $PackageJson } from "./configs/packageJson";
import { DevLogger } from "./logger";
import { Loopable, SharedAsyncIterable, SharedFollower } from "./toolkit";
import { getTui } from "./tui";

const debug = DevLogger("bfsp:deps");

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
      debug(`deps changed: ${projectDirpath}`);
      depsPanel.updateStatus("loading");
      const yarnTask = runYarn({
        root: projectDirpath,
        onMessage: (s) => {
          depsPanel.log(s);
        },
        onFlag: (s, loading) => {
          depsPanel.line("...." + s);
        },
      });
      stoppable = yarnTask;
      const isSuccess = await yarnTask.afterDone;
      follower.push(isSuccess);
      depsPanel.updateStatus(isSuccess ? "success" : "error");
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
