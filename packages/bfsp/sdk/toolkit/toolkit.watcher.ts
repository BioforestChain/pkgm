import { FbWatchmanClient, SubscribeOptions, WatchProjectResponse } from "@bfchain/pkgm-base/lib/fb-watchman";
import { EasyMap } from "@bfchain/pkgm-base/util/extends_map";
import { createHash } from "node:crypto";
import { consoleLogger } from "../logger/consoleLogger";

let _wm: FbWatchmanClient | undefined;
const getWm = () => {
  return (_wm ??= new FbWatchmanClient());
};

const watchCache = EasyMap.from({
  transformKey: (args: { root: string; logger: PKGM.ConsoleLogger }) => {
    return args.root;
  },
  creater: async (args, root) => {
    const wm = getWm();
    await wm.afterReady();
    let cache: { projectResp: Promise<WatchProjectResponse>; ref: number } | undefined;

    return {
      wm,
      refProjectResp: () => {
        if (cache === undefined) {
          cache = {
            projectResp: wm.commandAsync(["watch-project", root]).then((projectResp) => {
              if (projectResp.warning) {
                // It is considered to be best practice to show any 'warning' or
                // 'error' information to the user, as it may suggest steps
                // for remediation
                args.logger.warn(projectResp.warning);
              }
              return projectResp;
            }),
            ref: 1,
          };
          wm.ref();
        }
        return cache.projectResp;
      },
      unrefProjectResp: async () => {
        if (cache === undefined) {
          return;
        }
        cache.ref -= 1;
        if (cache.ref === 0) {
          const { projectResp } = cache;
          cache = undefined;
          await wm.commandAsync(["watch-del", (await projectResp).watch]);
          if (wm.unref()) {
            _wm = undefined;
          }
        }
      },
    };
  },
});

/// 目录监听器
const subscriptionCache = EasyMap.from({
  transformKey: (args: { root: string; logger: PKGM.TuiLogger }) => {
    return args.root;
  },
  creater: async (args, root) => {
    const projectBaseName = `[${createHash("md5").update(root).digest("base64")}]`;

    const doWatch = async (
      subOptions: SubscribeOptions,
      cb: (filename: string, type: Bfsp.WatcherAction) => unknown,
      subName?: string
    ) => {
      const { wm, refProjectResp, unrefProjectResp } = await watchCache.forceGet(args);
      const projectResp = await refProjectResp();

      const sub = {
        fields: ["name", "new", "exists"],
        relative_root: projectResp.relative_path,
        ...subOptions,
      };
      delete sub.chokidar;

      if (subName === undefined) {
        subName = `${projectBaseName}:${createHash("md5").update(JSON.stringify(sub)).digest("base64")}`;
      }

      const onSubscription = (subscriptionResp: any) => {
        if (subscriptionResp.subscription !== subName) return;
        const files = subscriptionResp.files;
        files &&
          files.forEach(function (file: any) {
            cb(file.name, file.new ? "add" : file.exists ? "change" : "unlink");
          });
      };
      wm.on("subscription", onSubscription);
      await wm.commandAsync(["subscribe", projectResp.watch, subName, sub]);
      return async () => {
        wm.off("subscription", onSubscription);
        // !! uncomment the following line will cause fb-watchman to unwatch the workspace root !!
        // await wm.commandAsync(["unsubscribe", projectResp.watch, subName!]);
        await unrefProjectResp();
      };
    };

    return { doWatch };
  },
});

export const getWatcher = (root: string, logger: PKGM.TuiLogger) => subscriptionCache.forceGet({ root, logger });
