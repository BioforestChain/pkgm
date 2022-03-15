import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { defineCommand } from "../bin";
import { Debug } from "../src/logger";
import { doTest } from "./test";
import inspector from "node:inspector";

export const testCommand = defineCommand(
  "test",
  {
    args: [{ type: "rest", name: "tests", description: "test names" }],
  } as const,
  async (params, args) => {
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

    await doTest({
      root,
      tests,
      debug: inspector.url() !== undefined,
      logger: {
        outWrite: (s) => console.log(s),
        errWrite: (s) => console.log(s),
      },
    });
    process.exit(0);
  }
);
