import { EasyMap } from "@bfchain/util-extends-map";
import { Client } from "fb-watchman";
import { createHash } from "node:crypto";
import { platform, arch } from "node:os";
import path from "node:path";
import { require } from "./toolkit.require";
import { getTui } from "./tui";
import { spawnSync } from "node:child_process";

let watchmanBinaryPath: string | undefined;
/**
 * 检测是否有全局安装watchman
 */
const localWatchmanVersion = spawnSync("watchman", ["--version"]).stdout?.toString();
/**
 * 没有全局安装，使用本地依赖的版本
 */
if (localWatchmanVersion === undefined) {
  const binaryPkgName = `@bfchain/watchman-binary-${platform()}-${arch()}`;
  try {
    watchmanBinaryPath = require.resolve(binaryPkgName + "/binary");
  } catch (err) {
    console.error(err);
  }
  if (watchmanBinaryPath) {
    watchmanBinaryPath = path.join(
      path.dirname(require.resolve("@bfchain/pkgm-bfsp/package.json")),
      "assets/watchman",
      watchmanBinaryPath
    );
  } else {
    /**
     * @Todo 不支持watchman，应该使用其它库进行替代
     */
  }
}

const wm = new Client({
  watchmanBinaryPath,
});

const checkWatcher = new Promise<void>((resolve, reject) => {
  wm.capabilityCheck({ optional: [], required: ["relative_root"] }, function (error: unknown, resp: unknown) {
    if (error) {
      reject(error);
      wm.end();
    } else {
      resolve();
    }
  });
});

type WatchProjectResponse = {
  version: string;
  watch: string;
  watcher: string;
  warning?: string;
  relative_path: string;
};
type SubscribeOptions = {
  fields?: string[];
  since?: string;
  relative_root?: string;
  expression: SubscribeOptions.Expression;
  chokidar?: {};
};
namespace SubscribeOptions {
  export type Expression = string | Array<Expression>;
}
type Watcher = WatchProjectResponse & {
  doWatch: (
    subOptions: SubscribeOptions,
    cb: (filename: string, type: Bfsp.WatcherAction) => unknown,
    subName?: string | undefined
  ) => void;
};
/// 目录监听器
const watcherCache = EasyMap.from({
  async creater(root: string) {
    await checkWatcher;
    return new Promise<Watcher>(async (resolve, reject) => {
      wm.command(["watch-project", root], function (error: unknown, projectResp: WatchProjectResponse) {
        if (error) {
          reject(error);
          return;
        }

        // It is considered to be best practice to show any 'warning' or
        // 'error' information to the user, as it may suggest steps
        // for remediation
        if (projectResp.warning) {
          getTui().getPanel("Bundle").write("warn", projectResp.warning);
        }

        const projectBaseName = `[${createHash("md5").update(root).digest("base64")}]`;

        const doWatch = (
          subOptions: SubscribeOptions,
          cb: (filename: string, type: Bfsp.WatcherAction) => unknown,
          subName?: string
        ) => {
          return new Promise<void>((resolve, reject) => {
            // type ClockResponse = {
            //   clock: string;
            // };
            // wm.command(["clock", projectResp.watch], function (errorerror: unknown, clockResp: ClockResponse) {
            //   if (error) {
            //     console.error("Failed to query clock:", error);
            //     reject(error);
            //     return;
            //   }
            // });

            delete subOptions.chokidar;
            const sub = {
              fields: ["name", "new", "exists"],
              relative_root: projectResp.relative_path,
              ...subOptions,
            };

            if (subName === undefined) {
              subName = `${projectBaseName}:${createHash("md5").update(JSON.stringify(sub)).digest("base64")}`;
            }

            wm.command(["subscribe", projectResp.watch, subName, sub], function (errorerror: unknown) {
              if (error) {
                // Probably an error in the subscription criteria
                console.error("failed to subscribe: ", error);
                reject(error);
                return;
              }
              resolve();
            });
            wm.on("subscription", function (subscriptionResp: any) {
              if (subscriptionResp.subscription !== subName) return;

              subscriptionResp.files.forEach(function (file: any) {
                cb(file.name, file.new ? "add" : file.exists ? "change" : "unlink");
              });
            });
          });
        };

        resolve({ ...projectResp, doWatch });
      });
    });
  },
});

export const getWatcher = (root: string) => watcherCache.forceGet(root);
