import { chalk } from "@bfchain/pkgm-base/lib/chalk.mjs";
import { slash } from "@bfchain/pkgm-base/toolkit/toolkit.path.mjs";
import { Closeable } from "@bfchain/pkgm-base/toolkit/toolkit.stream.mjs";
import { Aborter } from "@bfchain/pkgm-base/util/aborter.mjs";
import { safePromiseOffThen, safePromiseThen } from "@bfchain/pkgm-base/util/extends_promise_safe.mjs";
import { createTscLogger, DevLogger, getTui, doDevBfsp } from "@bfchain/pkgm-bfsp/sdk/index.mjs";
import { runTsc } from "@bfchain/pkgm-base/service/tsc/runner.mjs";
import path from "node:path";
import { WorkspaceConfig } from "../main/configs/workspaceConfig.mjs";

export const doDevBfsw = async (args: { workspaceConfig: WorkspaceConfig; format?: Bfsp.Format }) => {
  const debug = DevLogger("bfsw:bin/dev");
  const workspacePanel = getTui().getPanel("Workspaces");
  const { logger } = workspacePanel;

  const { workspaceConfig } = args;
  type $DevBfsp = ReturnType<typeof doDevBfsp>;

  const devBfspMap = new Map<string, { devBfsp: $DevBfsp; stop: Function }>();
  // let stoped = false;
  const aborter = new Aborter();
  const stop = () => {
    if (aborter.isAborted) {
      return;
    }
    aborter.abort();
    for (const [projectRoot, devBfsp] of devBfspMap) {
      devBfsp.stop();
      logger.info("stoped dev project in %s", path.relative(workspaceConfig.root, projectRoot));
    }
    devBfspMap.clear();
  };

  (async () => {
    const devPanel = getTui().getPanel("Dev");
    listening: for await (const projectConfigStreamsMap of aborter.wrapAsyncIterator(
      workspaceConfig.projectConfigStreamsMapStream.toAI()
    )) {
      for (const [projectRoot, projectConfigStreams] of projectConfigStreamsMap) {
        if (aborter.isAborted) {
          break listening;
        }
        if (devBfspMap.has(projectRoot)) {
          continue;
        }

        const relativePath = path.relative(workspaceConfig.root, projectRoot);
        const loggerPrefix = `[${slash(relativePath)}]`;
        const bfspLoggerKit = workspacePanel.createLoggerKit({
          name: relativePath,
          prefix: loggerPrefix,
          order: 0,
        });

        /// 开始执行编译
        const devBfsp = doDevBfsp(
          {
            root: projectRoot,
            format: args.format,
            subStreams: projectConfigStreams,
          },
          {
            loggerKit: devPanel.createLoggerKit({
              name: relativePath,
              prefix: loggerPrefix,
              order: 0,
            }),
          }
        );
        continue;
        const bfspLogger = bfspLoggerKit.logger;
        devBfsp.onStart(async () => {
          if (bfspLogger.hasLoading("doDev") === false) {
            bfspLogger.success.unpin("doDev");
            bfspLogger.error.unpin("doDev");
            bfspLogger.loadingStart("doDev");
          }
        });
        devBfsp.onSuccess(() => {
          bfspLogger.loadingEnd("doDev");
          bfspLogger.error.unpin("doDev");
          bfspLogger.success.pin("doDev", "build finished");
        });
        devBfsp.onError(() => {
          bfspLogger.loadingEnd("doDev");
          bfspLogger.success.unpin("doDev");
          bfspLogger.error.pin("doDev", "build failed");
        });

        /// 中断器
        const stop = () => {
          devBfsp.abortable.close();
          bfspLoggerKit.destroy();
          safePromiseOffThen(aborter.afterAborted, stop);
        };
        safePromiseThen(aborter.afterAborted, stop);

        /// 存储
        devBfspMap.set(projectRoot, {
          devBfsp,
          stop,
        });
      }
    }
  })();

  (async () => {
    listening: for await (const deletedProjectRoots of aborter.wrapAsyncIterator(
      workspaceConfig.removeProjectRootsStream.toAI()
    )) {
      for (const projectRoot of deletedProjectRoots) {
        if (aborter.isAborted) {
          break listening;
        }
        devBfspMap.get(projectRoot)?.stop();
        devBfspMap.delete(projectRoot);
      }
    }
  })();

  return {
    stop,
  };
};

/**
 * 运行 workspaces 的 tsc 编译
 *
 * 与直接运行 tsc 不同，多项目模式下， tsconfig.references 会发生改变，
 * 而 tsc 目前对这种动态变化有编译上的bug，所以我们需要按需重启 tsc
 */
export const runBfswTsc = (workspaceConfig: WorkspaceConfig) => {
  const tscLogger = createTscLogger();
  const tscPanel = getTui().getPanel("Tsc");
  const pinRestartReason = (reasons: Set<unknown>) => {
    tscPanel.logger.log.pin("restart-reason", [...reasons].filter((r) => typeof r === "string").join("\n"));
  };
  const unpinRestartReason = () => {
    tscPanel.logger.log.unpin("restart-reason");
  };

  const doTsc = Closeable(
    "bfsw-tsc",
    async (reasons) => {
      pinRestartReason(reasons);

      const tscTask = runTsc({
        watch: true,
        tsconfigPath: path.join(workspaceConfig.root, "tsconfig.json"),
        onMessage: (s) => tscLogger.write(s),
        onClear: () => tscLogger.clear(),
        onErrorFound: unpinRestartReason,
        onSuccess: unpinRestartReason,
      });
      return () => {
        tscTask.stop();
      };
    },
    50
  );

  const formatProjectRoots = (projectRoots: Set<string>, prefix: string) => {
    return [...projectRoots]
      .map((projectRoot) => {
        return `${prefix} ${slash(path.relative(workspaceConfig.root, projectRoot))}`;
      })
      .join("\n");
  };

  workspaceConfig.removeProjectRootsStream.onNext((projectRoots) =>
    doTsc.restart(formatProjectRoots(projectRoots, chalk.yellow("remove")))
  );
  workspaceConfig.addProjectRootsStream.onNext((projectRoots) =>
    doTsc.restart(formatProjectRoots(projectRoots, chalk.green("add")))
  );
  if (workspaceConfig.projectConfigStreamsMapStream.hasCurrent()) {
    doTsc.start();
  }
  return doTsc;
};
