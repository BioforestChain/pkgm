import path from "node:path";
import { consts, cpr, folderIO, getTui, walkFiles } from "../src";
import { getBfspBuildService } from "../src/buildService";
import { createTscLogger, Debug, Warn } from "../src/logger";
import { watchSingle } from "../src/watcher";
import { writeBuildConfigs, installBuildDeps, runBuildTsc, doBuild } from "./build.core";
export const doNpm = async (options: { root: string }) => {
  const b = getTui().getPanel("Bundle");
  const root = options.root;
  const buildService = getBfspBuildService(watchSingle());
  const cfgs = await writeBuildConfigs({ root, buildService });
  await installBuildDeps({ root });
  await runBuildTsc({ root, tscLogger: createTscLogger() });
  await doBuild({ root, buildService, cfgs });
  const npmPath = path.join(root, consts.NpmRootPath);
  const buildPath = path.join(root, consts.BuildOutRootPath);
  await cpr(buildPath, npmPath);

  b.write("info", `npm files ready at: ${npmPath}`);
};