import { isDeepStrictEqual } from "node:util";
import { runYarn } from "../bin/yarn/runner.mjs";
import { $PackageJson } from "./configs/packageJson.mjs";
import { DevLogger } from "../sdk/logger/logger.mjs";
import { Loopable, SharedAsyncIterable, SharedFollower } from "@bfchain/pkgm-base/toolkit/toolkit.stream.mjs";
import { getTui } from "../sdk/tui/index.mjs";
import { sleep } from "@bfchain/pkgm-base/util/extends_promise.mjs";

const debug = DevLogger("bfsp:deps");
type DepsEventCallback = () => unknown;

const comparablePackageJsonDependencies = (packageJson: unknown) => {
  if (typeof packageJson === "object" && packageJson !== null) {
    return {
      dependencies: Reflect.get(packageJson, "dependencies"),
      devDependencies: Reflect.get(packageJson, "devDependencies"),
      peerDependencies: Reflect.get(packageJson, "peerDependencies"),
      optionalDependencies: Reflect.get(packageJson, "optionalDependencies"),
    };
  }
};

export type $WatchDepsStream = ReturnType<typeof doWatchDeps>;

export const doWatchDeps = (
  projectDirpath: string,
  packageJsonStream: SharedAsyncIterable</*$PackageJson:*/ any>,
  options: { runInstall: boolean; runListGetter?: () => string[] }
) => {
  const { runInstall = false } = options;
  let startInstallCb: DepsEventCallback | undefined;
  let preDeps: ReturnType<typeof comparablePackageJsonDependencies>;
  type InstallDepsStates = "start" | "success" | "fail";
  const follower = new SharedFollower<InstallDepsStates>();
  let stopper: (() => void) | undefined;
  const loopable = Loopable(
    "watch deps",
    async () => {
      const packageJson = await packageJsonStream.waitCurrent();
      const curDeps = comparablePackageJsonDependencies(packageJson);
      if (isDeepStrictEqual(curDeps, preDeps)) {
        return;
      }
      preDeps = curDeps;
      if (runInstall) {
        startInstallCb && (await startInstallCb());
        debug(`deps changed: ${projectDirpath}`);
        const depsPanel = getTui().getPanel("Deps");

        follower.push("start");
        depsPanel.updateStatus("loading");
        const yarnTask = runYarn({
          root: projectDirpath,
          logger: depsPanel.depsLogger,
          rootPackageNameList: options.runListGetter?.(),
        });
        stopper = () => {
          offStopper();
          yarnTask.stop();
          stopper = undefined;
          preDeps = undefined;
        };
        const offStopper = stream.onStop(stopper);

        const isSuccess = await yarnTask.afterDone;

        follower.push(isSuccess ? "success" : "fail");
        depsPanel.updateStatus(isSuccess ? "success" : "error");
      } else {
        follower.push("success");
      }
    },
    100
  );

  //#region 监听变更
  packageJsonStream.onNext(() => {
    stopper?.();
    loopable.loop();
  });
  //#endregion

  /// 自启
  if (packageJsonStream.hasCurrent()) {
    loopable.loop();
  }

  const stream = new SharedAsyncIterable<InstallDepsStates>(follower);

  return stream;
};
