import { initMulti, watchTsPathInfo } from "../src/multi";
import { defineCommand } from "../bin";
import { ALLOW_FORMATS } from "../src/configs/bfspUserConfig";
import { Warn } from "../src/logger";
import { doDev } from "./dev.core";
import path from "node:path";

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
    const tasks = new Map<string, ReturnType<typeof doDev>>();
    initMulti(root, (p, cfg) => {
      const dir = path.dirname(p);
      if (tasks.has(dir)) {
        return;
      }
      tasks.set(dir, doDev({ format: format as Bfsp.Format, root: path.resolve(dir), profiles, cfg }));
    });
  }
);
