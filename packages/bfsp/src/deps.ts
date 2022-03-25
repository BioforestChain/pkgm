import { isDeepStrictEqual } from "node:util";
import { runYarn } from "../bin/yarn/runner";
import { $PackageJson } from "./configs/packageJson";
import { DevLogger } from "./logger";
import { Loopable, SharedAsyncIterable, SharedFollower } from "./toolkit";
import { getTui } from "./tui";

const debug = DevLogger("bfsp:deps");
type DepsEventCallback = () => unknown;

const comparablePackageJsonDependencies = (packageJson: $PackageJson) => {
  const Deps: Bfsp.Dependencies = {};
  const combine = (deps: any, prefix: string) => {
    for (const key in deps) {
      Deps[prefix + key] = deps[key];
    }
  };
  combine(packageJson.dependencies, "prd:");
  combine(packageJson.devDependencies, "dev:");
  combine(packageJson.peerDependencies, "peer:");
  combine(packageJson.optionalDependencies, "opt:");
  return Deps;
};

export const doWatchDeps = (
  projectDirpath: string,
  packageJsonStream: SharedAsyncIterable<$PackageJson>,
  options: { runInstall: boolean }
) => {
  const { runInstall = false } = options;
  let startInstallCb: DepsEventCallback | undefined;
  let preDeps: ReturnType<typeof comparablePackageJsonDependencies> = {};
  type InstallDepsStates = "start" | "success" | "fail";
  const follower = new SharedFollower<InstallDepsStates>();
  let stoppable: { stop: () => void } | undefined;
  const loopable = Loopable("watch deps", async () => {
    const packageJson = await packageJsonStream.getCurrent();
    const curDeps = comparablePackageJsonDependencies(packageJson);
    if (isDeepStrictEqual(curDeps, preDeps)) {
      return;
    }
    preDeps = curDeps;
    if (runInstall) {
      const depsPanel = getTui().getPanel("Deps");

      startInstallCb && (await startInstallCb());
      debug(`deps changed: ${projectDirpath}`);

      follower.push("start");
      depsPanel.updateStatus("loading");
      const yarnTask = runYarn({
        root: projectDirpath,
        logger: depsPanel.depsLogger,
      });
      stoppable = yarnTask;
      const isSuccess = await yarnTask.afterDone;

      follower.push(isSuccess ? "success" : "fail");
      depsPanel.updateStatus(isSuccess ? "success" : "error");
    } else {
      follower.push("success");
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

  const stream = new SharedAsyncIterable<InstallDepsStates>(follower);
  return {
    stream,
    stop() {
      stream.stop();
      if (stoppable) {
        stoppable.stop();
      }
    },
  };
};
