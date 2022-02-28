import { defineCommand } from "../bin";
import path from "node:path";
import { doCreate } from "./create.core";
import chalk from "chalk";

defineCommand(
  "create",
  {
    params: [
      { type: "string", name: "license", description: "project license, default is MIT", require: false },
    ],
    args: [[{ type: "string", name: "name", description: "project name, default is dirname" }], []],
    description: "create a new bfsp project."
  } as const,
  (params, args) => {
    const projectName = args[0];

    let root = process.cwd();

    if (projectName !== undefined) {
      if(/[\.\/\\]+/.test(projectName)) {
        throw chalk.red(`Invalid project name '${projectName}'`);
      }

      root = path.resolve(root, projectName);
    } else {
      throw chalk.red("Missing required argument projectName");
    }

    return doCreate({ root, name: projectName, license: params.license });
  }
);
