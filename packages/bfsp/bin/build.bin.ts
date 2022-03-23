import path from "node:path";
import { defineCommand } from "../bin";
import { getBfspBuildService } from "../src/buildService";
import { DevLogger } from "../src/logger";
import { watchSingle } from "../src/watcher";
import { doBuild, writeBuildConfigs } from "./build.core";
import { helpOptions } from "./help.core";
import { linkBFChainPkgmModules } from "./yarn/runner";

export const buildCommand = defineCommand(
  "build",
  {
    params: [
      { type: "string", name: "format", description: "bundle format: esm or cjs, default is esm." },
      { type: "string", name: "profiles", description: "bundle profiles, default is ['default']." },
    ],
    args: [[{ type: "string", name: "path", description: "project path, default is cwd." }], []],
    description: helpOptions.build,
  } as const,
  async (params, args, ctx) => {
    const warn = DevLogger("bfsp:bin/build");
    const debug = DevLogger("bfsp:bin/build");

    const profiles = params?.profiles?.split(",") || [];
    if (profiles.length === 0) {
      profiles.push("default");
    }
    let root = process.cwd();
    let maybeRoot = args[0];
    if (maybeRoot !== undefined) {
      root = path.resolve(root, maybeRoot);
    }

    /// 先确保将 pkgm 的包安置好
    linkBFChainPkgmModules(root);

    const buildService = getBfspBuildService(watchSingle());
    const cfgs = await writeBuildConfigs({ root, buildService });
    // await installBuildDeps({ root });
    // await runBuildTsc({ root, tscLogger: createTscLogger() });

    doBuild({ root, buildService, cfgs });
    // closeable?.start();
  }
);
