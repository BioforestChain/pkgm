import { defineCommand } from "../../bin";
import { doInit } from "./init.core";
import path from "node:path";

defineCommand(
  "init",
  {
    params: [
      { type: "string", name: "path", description: "project path, default is cwd()", require: false },
      { type: "string", name: "name", description: "project name, default is dirname", require: false },
      { type: "string", name: "license", description: "project license, default is MIT", require: false },
    ],
    args: [[{ type: "string", name: "path", description: "project path" }], []],
  } as const,
  (params, args) => {
    const { path: projectPath = args[0] || "." } = params;

    let root = process.cwd();

    if (projectPath !== undefined) {
      root = path.resolve(root, projectPath);
    }
    const projectName = params.name || path.basename(root);

    return doInit({ root, name: projectName, license: params.license });
  }
);
