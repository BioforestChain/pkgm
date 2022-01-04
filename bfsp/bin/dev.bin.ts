import { initMultiRoot, initTsc, initTsconfig, initWorkspace, multi } from "../src/multi";
import { watchDeps } from "../src/deps";
import { defineCommand } from "../bin";
import { ALLOW_FORMATS } from "../src/configs/bfspUserConfig";
import { Debug, Warn } from "../src/logger";
import { doDev } from "./dev.core";
import path from "node:path";
import { watchBfspProjectConfig, writeBfspProjectConfig, Loopable } from "../src";
import { runYarn } from "./yarn/runner";
import { Tasks, writeJsonConfig } from "./util";
import { tui } from "../src/tui";
import type { DepsPanel } from "../src/tui";
import { boot } from "./boot";
import { runBuild } from "./build.core";

defineCommand(
  "dev",
  {
    params: [
      { type: "string", name: "format", description: "bundle format: esm or cjs, default is esm." },
      { type: "string", name: "profiles", description: "bundle profiles, default is ['default']." },
    ],
    args: [[{ type: "string", name: "path", description: "project path, default is cwd." }], []],
  } as const,
  (params, args) => {
    const warn = Warn("bfsp:bin/dev");
    const log = Debug("bfsp:bin/dev");
    let { format } = params;
    if (format !== undefined && ALLOW_FORMATS.has(format as any) === false) {
      warn(`invalid format: '${format}'`);
      format = undefined;
    }

    const profiles = params?.profiles?.split(",") || [];
    if (profiles.length === 0) {
      profiles.push("default");
    }

    let root = process.cwd();
    let maybeRoot = args[0];
    if (maybeRoot !== undefined) {
      root = path.resolve(root, maybeRoot);
    }
    runBuild({ root, mode: "dev" });
  }
);
