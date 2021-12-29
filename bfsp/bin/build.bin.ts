import { PromiseOut, sleep } from "@bfchain/util-extends-promise";
import { existsSync, rmSync } from "node:fs";
import path, { format } from "node:path";
import { defineCommand } from "../bin";
import {
  writeBfspProjectConfig,
  watchBfspProjectConfig,
  SharedFollower,
  Loopable,
  SharedAsyncIterable,
  Closeable,
} from "../src";
import { consts } from "../src/consts";
import { Debug, Warn } from "../src/logger";
import { initMultiRoot, initTsc, initTsconfig, initWorkspace, multi, multiTsc, watchTsc } from "../src/multi";
import { watchDeps } from "../src/deps";
import { doBuild } from "./build.core";
import { runYarn } from "./yarn/runner";
import { Tasks } from "./util";
import { tui } from "../src/tui";
import type { DepsPanel } from "../src/tui";

defineCommand(
  "build",
  {
    params: [
      { type: "string", name: "format", description: "bundle format: esm or cjs, default is esm." },
      { type: "string", name: "profiles", description: "bundle profiles, default is ['default']." },
    ],
    args: [[{ type: "string", name: "path", description: "project path, default is cwd." }], []],
  } as const,
  (params, args) => {
    const warn = Warn("bfsp:bin/build");
    const log = Debug("bfsp:bin/build");
    const depsLogger = tui.getPanel("Deps")! as DepsPanel;

    const profiles = params?.profiles?.split(",") || [];
    if (profiles.length === 0) {
      profiles.push("default");
    }
    console.log(args);
    let root = process.cwd();
    let maybeRoot = args[0];
    if (maybeRoot !== undefined) {
      root = path.resolve(root, maybeRoot);
    }

    const map = new Map<
      string,
      { closable: ReturnType<typeof doBuild>; streams: ReturnType<typeof watchBfspProjectConfig> }
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
      depsLogger.updateStatus("loading");
      runYarn({
        root,
        onExit: () => {
          installingDep = false;
          if (pendingDepInstallation) {
            depLoopable.loop();
          }
        },
        onMessage: (s) => {
          depsLogger.write(s);
        },
      });
    });

    multi.registerAllUserConfigEvent(async (e) => {
      const resolvedDir = path.resolve(e.path);

      // 状态维护
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

      const BUILD_OUT_ROOT = path.resolve(path.join(resolvedDir, consts.BuildOutRootPath));
      const TSC_OUT_ROOT = path.resolve(path.join(resolvedDir, consts.TscOutRootPath));
      existsSync(TSC_OUT_ROOT) && rmSync(TSC_OUT_ROOT, { recursive: true, force: true });
      existsSync(BUILD_OUT_ROOT) && rmSync(BUILD_OUT_ROOT, { recursive: true, force: true });

      const projectConfig = { projectDirpath: resolvedDir, bfspUserConfig: e.cfg };
      const subConfigs = await writeBfspProjectConfig(projectConfig);
      const subStreams = watchBfspProjectConfig(projectConfig, subConfigs);
      const tscStream = watchTsc(e.path);
      const depStream = watchDeps(resolvedDir, subStreams.packageJsonStream);
      depStream.onNext(() => depLoopable.loop());
      const closable = doBuild({ root: resolvedDir, streams: subStreams, depStream, tscStream });
      map.set(e.path, { closable, streams: subStreams });
      subStreams.userConfigStream.onNext((x) => pendingTasks.add(e.path));
      subStreams.viteConfigStream.onNext((x) => pendingTasks.add(e.path));
      tscStream.onNext((x) => pendingTasks.add(e.path));
      depStream.onNext((x) => pendingTasks.add(e.path));
    });

    initMultiRoot(root);
    initWorkspace();
    depLoopable.loop();
    initTsconfig();
    initTsc();

    const pendingTasks = new Tasks<string>();
    tui.status.postMsg("Ready");
    const reporter = (s: string) => {
      tui.status.postMsg(`[ tasks remaining ... ${pendingTasks.remaining()} ] ${s}`);
    };
    const queueTask = async () => {
      const name = pendingTasks.next();
      if (name) {
        const s = map.get(name);
        if (s) {
          // console.log(`building ${name}`);
          await (await s.closable).start({ stateReporter: reporter });
          if (pendingTasks.remaining() === 0) {
            tui.status.postMsg("all build tasks completed");
          }

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
