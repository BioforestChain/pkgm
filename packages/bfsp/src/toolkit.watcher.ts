import { FbWatchmanClient, SubscribeOptions } from "@bfchain/pkgm-base/lib/fb-watchman";
import { EasyMap } from "@bfchain/pkgm-base/util/extends_map";
import { createHash } from "node:crypto";
import { getTui } from "./tui";

const wm = new FbWatchmanClient();

/// 目录监听器
const watcherCache = EasyMap.from({
  async creater(root: string) {
    await wm.afterReady();
    const projectResp = await wm.command(["watch-project", root]);

    // It is considered to be best practice to show any 'warning' or
    // 'error' information to the user, as it may suggest steps
    // for remediation
    if (projectResp.warning) {
      getTui().getPanel("Bundle").writeViteLog("warn", projectResp.warning);
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

      await wm.command(["subscribe", projectResp.watch, subName, sub]);
      wm.on("subscription", function (subscriptionResp: any) {
        if (subscriptionResp.subscription !== subName) return;

        subscriptionResp.files.forEach(function (file: any) {
          cb(file.name, file.new ? "add" : file.exists ? "change" : "unlink");
        });
      });
    };

    return { ...projectResp, doWatch };
  },
});

export const getWatcher = (root: string) => watcherCache.forceGet(root);
