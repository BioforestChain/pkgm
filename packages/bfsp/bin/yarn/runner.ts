import { getYarnPath } from "@bfchain/pkgm-base/lib/yarn";
import { PromiseOut } from "@bfchain/pkgm-base/util/extends_promise_out";
import cp from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
export interface RunYarnOption {
  root: string;
  onExit?: (done: boolean) => void;
  logger: PKGM.Logger;
  // onMessage?: (s: string) => void;
  // onError?: (s: string) => void;
  // onWarn?: (s: string) => void;
  // onSuccess?: (s: string) => void;
  // onFlag?: (s: string, loading?: boolean | number) => void;
}
export const linkBFChainPkgmModules = (root: string) => {
  const isBFChainPkgmModuleDir = (moduleDir: string) => {
    const packageJsonPath = path.join(moduleDir, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      try {
        const moduleName = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")).name as string;
        if (moduleName.startsWith("@bfchain/pkgm-") || moduleName === "@bfchain/pkgm") {
          return moduleName;
        }
      } catch {}
    }
  };
  /**
   * 找到执行文件对应的目录
   * 这里也许用 process.argv[1] 会更好？但这个值可能被篡改，我们可能无法确切知道真正的启动程序的入口 js 文件
   */
  let dirname = path.dirname(fileURLToPath(import.meta.url));
  while (true) {
    if (isBFChainPkgmModuleDir(dirname) !== undefined) {
      break;
    }
    const parentDirname = path.dirname(dirname);
    if (parentDirname === dirname) {
      dirname = "";
      break;
    }
    dirname = parentDirname;
  }
  if (dirname !== "") {
    const bfchainModulesDir = path.dirname(dirname);
    for (const folderName of fs.readdirSync(bfchainModulesDir)) {
      const moduleDirPath = path.join(bfchainModulesDir, folderName);
      const moduleName = isBFChainPkgmModuleDir(moduleDirPath);
      if (moduleName !== undefined) {
        /**
         * @warn 这里耦合了 传统 node_modules 文件夹寻址的规则
         */
        const destDir = path.join(root, "node_modules", moduleName);
        if (fs.existsSync(destDir) === false) {
          fs.mkdirSync(path.dirname(destDir), { recursive: true });
          fs.symlinkSync(moduleDirPath, destDir, "junction");
        }
      }
    }
  }
};

export const runYarn = (opts: RunYarnOption) => {
  let proc: cp.ChildProcessWithoutNullStreams | undefined;
  let killed = false;
  let yarnRunSuccess = true;
  const donePo = new PromiseOut<boolean>();
  const ret = {
    stop() {
      killed = true;
      proc?.kill();
    },
    afterDone: donePo.promise,
  };

  (() => {
    const yarnPath = getYarnPath();
    if (killed) {
      return;
    }
    const {
      // onMessage = () => {},
      // onSuccess = onMessage,
      // onError = onMessage,
      // onWarn = onError,
      // onFlag = onMessage,
      logger,
    } = opts;

    proc = cp.spawn(
      "node",
      [
        yarnPath,
        "install",
        "--json",
        // 这个参数一定要给，否则有些时候环境变量可能会被未知的程序改变，传递的环境变量会进一步改变默认 yarn install 的默认行为
        "--production=false",
      ],
      { cwd: opts.root, env: {} }
    ); // yarn install --non-interactive

    /**
     * 需要这个，是因为yarn有bug
     * 会连续出现多个 progressStart 而没有提供 progressEnd
     */
    let preProgressId = "";
    /**
     * 需要这个，是因为yarn有bug
     * progressEnd 之后还会提供 progressTick
     */
    const progressIdSet = new Set<string>();
    let currentStep = "";
    const onJsonLines = (chunk: Buffer) => {
      const Lines = String(chunk).trim().split("\n");
      for (const jsonLine of Lines) {
        try {
          const json = JSON.parse(jsonLine);
          switch (json.type) {
            case "step":
              logger.log(`[${json.data.current}/${json.data.total}] ${(currentStep = json.data.message)}`);
              break;
            case "activityStart":
              logger.loadingStart(json.data.id);
              break;
            case "activityTick":
              logger.loadingLog(json.data.id, json.data.name);
              break;
            case "activityEnd":
              logger.loadingEnd(json.data.id);
              break;
            case "progressStart":
              // 这里这样做，目的是为了只允许出现一个 yarn-progress
              if (preProgressId !== "") {
                logger.progressEnd(preProgressId);
                progressIdSet.delete(preProgressId);
                preProgressId = "";
              }
              logger.progressStart((preProgressId = json.data.id), json.data.total);
              progressIdSet.add(preProgressId);
              break;
            case "progressTick":
              if (progressIdSet.has(json.data.id)) {
                logger.progressLog(json.data.id, json.data.current, currentStep);
              }
              break;
            case "progressFinish":
              logger.progressEnd(json.data.id);
              progressIdSet.delete(preProgressId);
              preProgressId = "";
              break;
            case "success":
              logger.success(json.data);
              yarnRunSuccess = true;
              break;
            case "info":
              logger.info(json.data);
              break;
            case "warn":
            case "warning":
              logger.warn(json.data);
              break;
            case "error":
              logger.error(json.data);
              yarnRunSuccess = false;
              break;
            default:
              logger.warn(jsonLine);
          }
        } catch (err) {
          logger.error(jsonLine);
        }
      }
    };
    proc.stdout?.on("data", onJsonLines);
    proc.stderr?.on("data", onJsonLines);

    proc.on("exit", () => {
      /// 将 @bfchain/pkgm 的所有包 link 到对应目录下
      linkBFChainPkgmModules(opts.root);
      donePo.resolve(yarnRunSuccess);
      opts.onExit?.(yarnRunSuccess);
    });
  })();

  return ret;
};
