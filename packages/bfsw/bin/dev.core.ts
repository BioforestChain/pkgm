import { DevLogger, doDevBfsp, getTui, toPosixPath } from "@bfchain/pkgm-bfsp";
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
        const loggerPrefix = `[${relativePath.replace(/\\+/g, "/")}]`;
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
    listening: for await (const deletedProjectRoots of workspaceConfig.deletedProjectRootsStream) {
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
