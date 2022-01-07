import { Debug } from "./logger";
import { Loopable, SharedAsyncIterable, SharedFollower } from "./toolkit";
import { $PackageJson } from "./configs/packageJson";
import { isDeepStrictEqual } from "node:util";

const log = Debug("bfsp:deps");
export const watchDeps = (projectDirpath: string, packageJsonStream: SharedAsyncIterable<$PackageJson>) => {
  let curDeps = {};
  const follower = new SharedFollower<boolean>();
  let stoppable: { stop: () => void } | undefined;
  const looper = Loopable("watch deps", async () => {
    const packageJson = await packageJsonStream.getCurrent();
    if (isDeepStrictEqual(packageJson.dependencies, curDeps)) {
      return;
    }
    curDeps = packageJson.dependencies;
    log("deps changed");
    follower.push(true);
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
