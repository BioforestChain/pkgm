import { isDeepStrictEqual } from "node:util";
import { runYarn } from "../bin/yarn/runner.mjs";
import { $PackageJson } from "./configs/packageJson.mjs";
import { DevLogger } from "../sdk/logger/logger.mjs";
import { Loopable, SharedAsyncIterable, SharedFollower } from "@bfchain/pkgm-base/toolkit/toolkit.stream.mjs";
import { getTui } from "../sdk/tui/index.mjs";
import { sleep } from "@bfchain/pkgm-base/util/extends_promise.mjs";
import { $YarnListRes } from "@bfchain/pkgm-base/service/yarn/runner.mjs";

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
  options: { runInstall: boolean; rootPackageNameListGetter: () => string[] }
) => {
  const { runInstall = false } = options;
  let startInstallCb: DepsEventCallback | undefined;
  let preDeps: ReturnType<typeof comparablePackageJsonDependencies>;
  const follower = new SharedFollower<
    { state: "start" } | { state: "success"; info?: $YarnListRes } | { state: "fail" }
  >();
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

        follower.push({ state: "start" });
        depsPanel.updateStatus("loading");
        const yarnTask = runYarn({
          root: projectDirpath,
          logger: depsPanel.depsLogger,
          rootPackageNameList: options.rootPackageNameListGetter(),
        });
        stopper = () => {
          offStopper();
          yarnTask.stop();
          stopper = undefined;
          preDeps = undefined;
        };
        const offStopper = stream.onStop(stopper);
        await yarnTask.afterDone;
        if (yarnTask.success) {
          follower.push({ state: "success", info: yarnTask.yarnListRes });
          depsPanel.updateStatus("success");
        } else {
          follower.push({ state: "fail" });
          depsPanel.updateStatus("error");
        }
      } else {
        follower.push({ state: "success" });
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

  const stream = new SharedAsyncIterable(follower);

  return stream;
};
