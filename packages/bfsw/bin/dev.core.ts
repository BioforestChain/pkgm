import { DevLogger, doDevBfsp, getTui } from "@bfchain/pkgm-bfsp";
import path from "node:path";
import { WorkspaceConfig } from "../src/configs/workspaceConfig";
export const doDevBfsw = async (args: { workspaceConfig: WorkspaceConfig; format?: Bfsp.Format }) => {
  const debug = DevLogger("bfsw:bin/dev");
  const workspacePanel = getTui().getPanel("Workspaces");
  const { logger } = workspacePanel;
  logger.info("hi~~~");

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
        const devBfsp = doDevBfsp({
          root: projectRoot,
          format: args.format,
          subStreams: projectConfigStreams,
        });
        logger.success("started dev project in %s", path.relative(workspaceConfig.root, projectRoot));
        devBfspMap.set(projectRoot, {
          devBfsp,
          stop() {
            devBfsp.abortable.close();
            logger.info("stoped dev project in %s", path.relative(workspaceConfig.root, projectRoot));
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
