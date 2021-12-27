import { PromiseOut, sleep } from "@bfchain/util-extends-promise";
import { initMultiRoot, initTsc, initTsconfig, initWorkspace, multi, multiTsc, watchTsc } from "../src/multi";
import { watchDeps } from "../src/deps";
import { defineCommand } from "../bin";
import { ALLOW_FORMATS } from "../src/configs/bfspUserConfig";
import { Debug, Warn } from "../src/logger";
import { doDev } from "./dev.core";
import path from "node:path";
import {
  watchBfspProjectConfig,
  writeBfspProjectConfig,
  SharedFollower,
  Loopable,
  SharedAsyncIterable,
  Closeable,
} from "../src";
import { runYarn } from "./yarn/runner";
import { Tasks, writeJsonConfig } from "./util";

defineCommand(
  "dev",
  {
    params: [
      { type: "string", name: "format", description: "bundle format: esm or cjs, default is esm." },
      { type: "string", name: "profiles", description: "bundle profiles, default is ['default']." },
    ],
    args: [[{ type: "string", name: "path", description: "project path, default is cwd." }], []],
  } as const,
  (params, args) => {
    const warn = Warn("bfsp:bin/dev");
    const log = Debug("bfsp:bin/dev");
    let { format } = params;
    if (format !== undefined && ALLOW_FORMATS.has(format as any) === false) {
      warn(`invalid format: '${format}'`);
      format = undefined;
    }

    const profiles = params?.profiles?.split(",") || [];
    if (profiles.length === 0) {
      profiles.push("default");
    }

    let root = process.cwd();
    let maybeRoot = args[0];
    if (maybeRoot !== undefined) {
      root = path.resolve(root, maybeRoot);
    }
    const map = new Map<
      string,
      { closable: ReturnType<typeof doDev>; streams: ReturnType<typeof watchBfspProjectConfig> }
    >();

    let installingDep = false;
    let pendingDepInstallation = false;
    const depLoopable = Loopable("install dep", () => {
      if (installingDep) {
        return;
      }
      installingDep = true;
      pendingDepInstallation = false;
      log("installing dep");
      runYarn({
        root,
        onExit: () => {
          installingDep = false;
          if (pendingDepInstallation) {
            depLoopable.loop();
          }
        },
      });
    });

    multi.registerAllUserConfigEvent(async (e) => {
      if (e.type === "unlink") {
        const s = map.get(e.path)?.streams;
        if (s) {
          s.stopAll();
          map.delete(e.path);
        }
        return;
      }
      if (map.has(e.path)) {
        return;
      }

      const resolvedDir = path.resolve(e.path);

      const projectConfig = { projectDirpath: resolvedDir, bfspUserConfig: e.cfg };
      const subConfigs = await writeBfspProjectConfig(projectConfig);
      const subStreams = watchBfspProjectConfig(projectConfig, subConfigs);
      const depStream = watchDeps(resolvedDir, subStreams.packageJsonStream);
      depStream.onNext(() => depLoopable.loop());
      const closable = doDev({ root: resolvedDir, streams: subStreams, depStream, format: format as Bfsp.Format });
      map.set(e.path, { closable, streams: subStreams });
      subStreams.userConfigStream.onNext((x) => pendingTasks.add(e.path));
      subStreams.tsConfigStream.onNext((x) => pendingTasks.add(e.path));
      subStreams.viteConfigStream.onNext((x) => pendingTasks.add(e.path));
    });

    initMultiRoot(root);
    initWorkspace();
    depLoopable.loop();
    initTsconfig();
    initTsc();

    const pendingTasks = new Tasks<string>();
    const queueTask = async () => {
      const name = pendingTasks.next();
      if (name) {
        const s = map.get(name);
        if (s) {
          // console.log(`building ${name}`);
          await (await s.closable).start();

          await queueTask();
        }
      } else {
        setTimeout(async () => {
          await queueTask();
        }, 1000);
      }
    };
    queueTask();
  }
);
