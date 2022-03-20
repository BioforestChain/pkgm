import { isDeepStrictEqual } from "node:util";
import { runYarn } from "../bin/yarn/runner";
import { $PackageJson } from "./configs/packageJson";
import { DevLogger } from "./logger";
import { Loopable, SharedAsyncIterable, SharedFollower } from "./toolkit";
import { getTui } from "./tui";

const debug = DevLogger("bfsp:deps");
type DepsEventCallback = () => unknown;

export const doWatchDeps = (
  projectDirpath: string,
  packageJsonStream: SharedAsyncIterable<$PackageJson>,
  options?: { runInstall: boolean }
) => {
  const depsPanel = getTui().getPanel("Deps");
  let startInstallCb: DepsEventCallback | undefined;
  let curDeps = {};
  const follower = new SharedFollower<boolean>();
  let stoppable: { stop: () => void } | undefined;
  const loopable = Loopable("watch deps", async () => {
    const packageJson = await packageJsonStream.getCurrent();
    if (isDeepStrictEqual(packageJson.dependencies, curDeps)) {
      return;
    }
    curDeps = packageJson.dependencies;
    if (options?.runInstall) {
      startInstallCb && (await startInstallCb());
      debug(`deps changed: ${projectDirpath}`);
      depsPanel.updateStatus("loading");
      const logger = depsPanel.logger;
      const yarnTask = runYarn({
        root: projectDirpath,
        onMessage: (s) => {
          logger.log(s);
        },
        onFlag: (s, loading) => {
          logger.log.line("...." + s);
        },
        onWarn: (s) => {
          logger.warn(s);
        },
        onSuccess: (s) => {
          logger.success(s);
        },
        onError: (s) => {
          logger.error(s);
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
    loopable.loop();
  });
  //#endregion

  return {
    loopable,
    stream: new SharedAsyncIterable<boolean>(follower),
    get onStartInstall() {
      return startInstallCb;
    },
    set onStartInstall(cb: typeof startInstallCb) {
      startInstallCb = cb;
    },
  };
};
