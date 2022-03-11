import path from "node:path";
import { defineCommand } from "../bin";

import { doNpm } from "./npm.core";
import { helpOptions } from "./help.core";

defineCommand(
  "npm",
  {
    params: [
      { type: "string", name: "format", description: "bundle format: esm or cjs, default is esm." },
      { type: "string", name: "profiles", description: "bundle profiles, default is ['default']." },
    ],
    args: [[{ type: "string", name: "path", description: "project path, default is cwd." }], []],
    description: helpOptions.npm
  } as const,
  async (params, args) => {
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
    doNpm({ root });
    // closeable?.start();
  }
);
