import path from "node:path";
import { defineCommand } from "../bin";
import { getBfspBuildService } from "../src/buildService";
import { createTscLogger, Debug, Warn } from "../src/logger";
import { watchSingle } from "../src/watcher";
import { doBuild, installBuildDeps, runBuildTsc, writeBuildConfigs } from "./build.core";
import { helpOptions } from "./help.core";

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
  async (params, args) => {
    const warn = Warn("bfsp:bin/build");
    const log = Debug("bfsp:bin/build");

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

    const buildService = getBfspBuildService(watchSingle());
    const cfgs = await writeBuildConfigs({ root, buildService });
    await installBuildDeps({ root });
    await runBuildTsc({ root, tscLogger: createTscLogger() });

    doBuild({ root, buildService, cfgs });
    // closeable?.start();
  }
);
