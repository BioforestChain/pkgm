import { defineCommand } from "../bin";
import { doInit } from "./init.core";
import path from "node:path";

defineCommand(
  "init",
  {
    params: [{ type: "string", name: "path", description: "project path, default is cwd()" }],
    args: [[{ type: "string", name: "name", description: "project name" }], []],
  } as const,
  (params, args) => {
    let { path: projectPath } = params;
    let name = args[0];
    if (!name) {
      console.log("name missing");
      return;
    }
    let root = process.cwd();
    if (!projectPath) {
      projectPath = name;
    }
    if (projectPath !== undefined) {
      root = path.resolve(root, projectPath);
    }
    return doInit({ root, name });
  }
);
