import { FbWatchmanClient, SubscribeOptions } from "@bfchain/pkgm-base/lib/fb-watchman";
import { EasyMap } from "@bfchain/pkgm-base/util/extends_map";
import { consoleLogger } from "./consoleLogger";
import { createHash } from "node:crypto";

const wm = new FbWatchmanClient();

/// 目录监听器
const watcherCache = EasyMap.from({
  transformKey: (args: { root: string; logger: PKGM.ConsoleLogger }) => {
    return args.root;
  },
  creater: async (args, root) => {
    await wm.afterReady();
    const projectResp = await wm.commandAsync(["watch-project", root]);

    // It is considered to be best practice to show any 'warning' or
    // 'error' information to the user, as it may suggest steps
    // for remediation
    if (projectResp.warning) {
      args.logger.warn(projectResp.warning);
    }

    const projectBaseName = `[${createHash("md5").update(root).digest("base64")}]`;

    const doWatch = async (
      subOptions: SubscribeOptions,
      cb: (filename: string, type: Bfsp.WatcherAction) => unknown,
      subName?: string
    ) => {
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
        subscriptionResp.files.forEach(function (file: any) {
          cb(file.name, file.new ? "add" : file.exists ? "change" : "unlink");
        });
      };
      wm.on("subscription", onSubscription);
      await wm.commandAsync(["subscribe", projectResp.watch, subName, sub]);
      return () => {
        wm.off("subscription", onSubscription);
        return wm.commandAsync(["unsubscribe", projectResp.watch, subName!]);
      };
    };

    return { ...projectResp, doWatch };
  },
});

export const getWatcher = (root: string, logger: PKGM.ConsoleLogger = consoleLogger) =>
  watcherCache.forceGet({ root, logger });
