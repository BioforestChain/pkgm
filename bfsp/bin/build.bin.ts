import path from "node:path";
import { defineCommand } from "../bin";
import { getBfspBuildService } from "../src/core";
import { Debug, Warn } from "../src/logger";
import { watchSingle } from "../src/watcher";
import { doBuild } from "./build.core";

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

    doBuild({ root, buildService: getBfspBuildService(watchSingle()) });
    // closeable?.start();
  }
);
