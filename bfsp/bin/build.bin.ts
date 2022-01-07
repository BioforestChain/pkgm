import { PromiseOut, sleep } from "@bfchain/util-extends-promise";
import { existsSync, rmSync } from "node:fs";
import path, { format } from "node:path";
import { defineCommand } from "../bin";
import {
  writeBfspProjectConfig,
  watchBfspProjectConfig,
  SharedFollower,
  Loopable,
  SharedAsyncIterable,
  Closeable,
} from "../src";
import { consts } from "../src/consts";
import { Debug, Warn } from "../src/logger";
import { initMultiRoot, initTsc, initTsconfig, initWorkspace, multi, multiTsc, watchTsc } from "../src/multi";
import { watchDeps } from "../src/deps";
import { runBuild } from "./build.core";
import { runYarn } from "./yarn/runner";
import { Tasks } from "./util";
import { tui } from "../src/tui";
import type { DepsPanel } from "../src/tui";
import { boot } from "./boot";

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
    runBuild({ root, mode: "build" });
  }
);
