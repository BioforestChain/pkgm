import { isDeepStrictEqual } from "node:util";
import { runYarn } from "../bin/yarn/runner";
import { $PackageJson } from "./configs/packageJson";
import { DevLogger } from "../sdk/logger/logger";
import { Loopable, SharedAsyncIterable, SharedFollower } from "../sdk/toolkit/toolkit.stream";
import { getTui } from "../sdk/tui";
import { chalk } from "@bfchain/pkgm-base/lib/chalk";

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
  printDeps(packageJson);
  return Deps;
};

export const doWatchDeps = (
  projectDirpath: string,
  packageJsonStream: SharedAsyncIterable<$PackageJson>,
  options: { runInstall: boolean; runListGetter?: () => string[] }
) => {
  const { runInstall = false } = options;
  let startInstallCb: DepsEventCallback | undefined;
  let preDeps: ReturnType<typeof comparablePackageJsonDependencies> = {};
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
          preDeps = {};
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

/**
 * 打印依赖信息
 * @param packageJson
 */
const printDeps = (packageJson: Bfsp.TMap) => {
  const log = getTui().getPanel("Deps").logger;
  log.clear();
  const prints = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
  prints.forEach((dep) => {
    const depObject = packageJson[dep];
    if (Object.keys(depObject).length !== 0) {
      print(depObject, dep);
    }
  });

  function print(dep: Bfsp.Dependencies, flag: string) {
    log.info(`\n${chalk.bold.cyan(flag)}:`);
    Object.keys(dep).map((item) => {
      log.info(` ${chalk.bold.green(item)}\t${chalk.blue(dep[item])}`);
    });
  }
};
