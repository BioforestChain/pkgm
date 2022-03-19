import cp from "node:child_process";
import { getYarnPath } from "@bfchain/pkgm-base/lib/yarn";
import { PromiseOut } from "@bfchain/pkgm-base/util/extends_promise_out";
import { require } from "@bfchain/pkgm-base/src/toolkit.require";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { EasyMap } from "@bfchain/pkgm-base/util/extends_map";
export interface RunYarnOption {
  root: string;
  onExit?: (done: boolean) => void;
  onMessage?: (s: string) => void;
  onError?: (s: string) => void;
  onWarn?: (s: string) => void;
  onSuccess?: (s: string) => void;
  onFlag?: (s: string, loading?: boolean | number) => void;
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
  let yarnRunSuccess = false;
  const donePo = new PromiseOut<boolean>();
  const ret = {
    stop() {
      killed = true;
      proc?.kill();
    },
    afterDone: donePo.promise,
  };

  (async () => {
    const yarnPath = await getYarnPath();
    if (killed) {
      return;
    }
    const {
      onMessage = () => {},
      onSuccess = onMessage,
      onError = onMessage,
      onWarn = onError,
      onFlag = onMessage,
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
      { cwd: opts.root }
    ); // yarn install --non-interactive

    const progressMap = EasyMap.from({
      creater(id: string | number) {
        return { name: "", total: 0, current: 0 };
      },
    });
    let currentStep = "";
    const onJsonLines = (chunk: Buffer) => {
      const Lines = String(chunk).trim().split("\n");
      for (const jsonLine of Lines) {
        try {
          const json = JSON.parse(jsonLine);
          switch (json.type) {
            case "step":
              onMessage(`[${json.data.current}/${json.data.total}] ${(currentStep = json.data.message)}`);
              break;
            case "activityStart":
              break;
            case "activityTick":
              onFlag(`${json.data.name}`, true);
              break;
            case "activityEnd":
              break;
            case "progressStart":
              progressMap.forceGet(json.data.id).total = json.data.total;
              break;
            case "progressTick":
              const progressInfo = progressMap.forceGet(json.data.id);
              progressInfo.current = json.data.current;
              const progress = Math.min(progressInfo.current / progressInfo.total, 1);
              onFlag(currentStep, progress);
              break;
            case "progressFinish":
              break;
            case "success":
              onSuccess(json.data);
              yarnRunSuccess = true;
              break;
            case "info":
              onMessage(json.data);
              break;
            case "warn":
              onWarn(json.data);
              break;
            case "error":
              onError(json.data);
              yarnRunSuccess = false;
              break;
            default:
              onWarn(jsonLine);
          }
        } catch (err) {
          onError(jsonLine);
        }
      }
    };
    proc.stdout?.on("data", onJsonLines);
    proc.stderr?.on("data", onJsonLines);

    // proc.stdout?.on("data", (chunk) => {
    //   const Lines = String(chunk).trim().split("\n");
    //   for (const log of Lines) {
    //     if (log.startsWith("success")) {
    //       onSuccess(log);
    //     } else if (log.startsWith("Done")) {
    //       yarnRunSuccess = true;
    //       onSuccess(log);
    //     } else {
    //       onMessage(log);
    //     }
    //   }
    // });
    // proc.stderr?.on("data", (chunk) => {
    //   const Lines = String(chunk).trim().split("\n");
    //   for (const log of Lines) {
    //     if (log.startsWith("warning")) {
    //       onWarn(log);
    //     } else {
    //       onError(log);
    //     }
    //   }
    // });
    proc.on("exit", async (e) => {
      /// 将 @bfchain/pkgm 的所有包 link 到对应目录下
      await linkBFChainPkgmModules(opts.root);
      donePo.resolve(yarnRunSuccess);
      opts.onExit?.(yarnRunSuccess);
    });
  })();

  return ret;
};
