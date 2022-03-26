import { chalk } from "@bfchain/pkgm-base/lib/chalk";
import { Closeable, createTscLogger, DevLogger, doDevBfsp, getTui, runTsc, slash } from "@bfchain/pkgm-bfsp";
import path from "node:path";
import { WorkspaceConfig } from "../src/configs/workspaceConfig";

export const doDevBfsw = async (args: { workspaceConfig: WorkspaceConfig; format?: Bfsp.Format }) => {
  const debug = DevLogger("bfsw:bin/dev");
  const workspacePanel = getTui().getPanel("Workspaces");
  const { logger } = workspacePanel;

  const { workspaceConfig } = args;
  type $DevBfsp = ReturnType<typeof doDevBfsp>;

  const devBfspMap = new Map<string, { devBfsp: $DevBfsp; stop: Function }>();
  let stoped = false;
  const stop = () => {
    stoped = true;
    for (const [projectRoot, devBfsp] of devBfspMap) {
      devBfsp.stop();
      logger.info("stoped dev project in %s", path.relative(workspaceConfig.root, projectRoot));
    }
    devBfspMap.clear();
  };

  (async () => {
    const devPanel = getTui().getPanel("Dev");
    listening: for await (const projectConfigStreamsMap of workspaceConfig.projectConfigStreamsMapStream) {
      if (stoped) {
        break listening;
      }
      for (const [projectRoot, projectConfigStreams] of projectConfigStreamsMap) {
        if (stoped) {
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
        const bfspLogger = bfspLoggerKit.logger;
        devBfsp.onStart(async () => {
          if (bfspLogger.hasLoading("doDev") === false) {
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

        devBfspMap.set(projectRoot, {
          devBfsp,
          stop() {
            devBfsp.abortable.close();
            bfspLoggerKit.destroy();
          },
        });
      }
    }
  })();

  (async () => {
    listening: for await (const deletedProjectRoots of workspaceConfig.removeProjectRootsStream) {
      if (stoped) {
        break listening;
      }
      for (const projectRoot of deletedProjectRoots) {
        if (stoped) {
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
