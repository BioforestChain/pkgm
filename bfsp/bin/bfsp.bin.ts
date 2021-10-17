import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { defineBin } from "../bin";
import { ALLOW_FORMATS } from "../src/configs/bfspUserConfig";
import { Debug, Warn } from "../src/logger";
import { doDev } from "./dev";
import { doTest } from "./test";

defineBin(
  "dev",
  {
    params: [
      { type: "string", name: "format", description: "bundle format: esm or cjs, default is esm." },
      { type: "string", name: "profiles", description: "bundle profiles, default is ['default']." },
    ],
    args: [[], [{ type: "string", name: "path", description: "project path, default is cwd." }]],
  } as const,
  (params, args) => {
    const warn = Warn("bfsp:bin/dev");
    let { format } = params;
    if (ALLOW_FORMATS.has(format as any) === false) {
      warn(`invalid format: '${format}'`);
      format = undefined;
    }

    const profiles = params?.profiles?.split(",") || [];
    if (profiles.length === 0) {
      profiles.push("default");
    }
    return doDev({ format: format as Bfsp.Format, root: args[0], profiles });
  }
);

defineBin(
  "test",
  {
    args: [{ type: "rest", name: "tests", description: "test names" }],
  } as const,
  (params, args) => {
    const log = Debug("bfsp:bin/test");

    let root = process.cwd();
    const tests = args[0];
    {
      let maybeCwd = tests[0];
      if (maybeCwd !== undefined) {
        maybeCwd = path.resolve(root, maybeCwd);
        if (existsSync(maybeCwd) && statSync(maybeCwd).isDirectory()) {
          root = maybeCwd;
          tests.shift();
        }
      }
    }
    for (const test of tests) {
      log("run test:", test);
    }

    return doTest({ root, tests });
  }
);
