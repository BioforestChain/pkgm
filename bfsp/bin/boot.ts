import { Debug } from "../src/logger";
import { tui } from "../src/tui";
import type { DepsPanel } from "../src/tui";
import { watchBfspProjectConfig } from "../src";
import { Loopable } from "../src/toolkit";
import { runYarn } from "./yarn/runner";
import { Tasks } from "./util";

// build和dev共享的启动逻辑

const log = Debug("bfsp:bin/boot");
const depsLogger = tui.getPanel("Deps")! as DepsPanel;

const map = new Map<
  string,
  {
    // doBuild和doDev抽象出来
    closable: { start(opts: { stateReporter: (s: string) => void }): Promise<void> };
    streams: ReturnType<typeof watchBfspProjectConfig>;
  }
>();

const pendingTasks = new Tasks<string>();
export function boot(root: string) {
  let installingDep = false;
  let pendingDepInstallation = false;
  let depInited = false;
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
        } else {
          if (!depInited) {
            tui.status.postMsg("dep installation finished");
            depInited = true;
            queueTask();
          }
        }
      },
      onMessage: (s) => {
        depsLogger.write(s);
      },
    });
  });

  return {
    map,
    depLoopable,
    pendingTasks,
  };
}

const reporter = (s: string) => {
  tui.status.postMsg(`[ tasks remaining ... ${pendingTasks.remaining()} ] ${s}`);
};
const queueTask = async () => {
  const name = pendingTasks.next();
  if (name) {
    const s = map.get(name);
    if (s) {
      // console.log(`building ${name}`);
      await s.closable.start({ stateReporter: reporter });
      if (pendingTasks.remaining() === 0) {
        tui.status.postMsg("all build tasks completed");
      }

      await queueTask();
    }
  } else {
    tui.status.postMsg("Waiting for tasks...");
    // 这里不用setInterval而采用链式setTimeout的原因是任务时间是不确定的
    setTimeout(async () => {
      await queueTask();
    }, 1000);
  }
};
