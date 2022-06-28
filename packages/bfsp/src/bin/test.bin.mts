import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { defineCommand } from "../bin.mjs";
import { DevLogger } from "../sdk/logger/logger.mjs";
import { doTest } from "./test.mjs";
import inspector from "node:inspector";

export const testCommand = defineCommand(
  "test",
  {
    args: [{ type: "rest", name: "tests", description: "test names" }],
  } as const,
  async (params, args) => {
    const debug = DevLogger("bfsp:bin/test");

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
      debug("run test:", test);
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
