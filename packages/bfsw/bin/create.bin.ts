import { chalk } from "@bfchain/pkgm-base/lib/chalk";
import { defineCommand } from "@bfchain/pkgm-bfsp";
import path from "node:path";
import { doCreateBfsw } from "./create.core";

export const createCommand = defineCommand(
  "create",
  {
    params: [
      { type: "string", name: "license", description: "project license, default is MIT", require: false },
      { type: "string", name: "name", description: "project name, default is dirname", require: false },
    ],
    args: [[{ type: "string", name: "name", description: "project name, default is dirname" }], []],
    description: `create a new bfsw project`,
  } as const,
  async (params, args, ctx) => {
    const projectRoot = path.resolve(process.cwd(), args[0] ?? ".");
    const projectName = params.name ?? path.basename(projectRoot);

    if (
      (await ctx.question(
        `
      ${chalk.gray`Project Directory`}: ${chalk.cyan(projectRoot)}
      ${chalk.gray`Project Name`}: ${chalk.cyan(projectName)}
      ${chalk.gray`Confirm`}? ${chalk.gray(`[${chalk.cyan.underline`Y`}/n]`)}
    `,
        {
          map: (anwser) => (anwser.trim().toLowerCase()[0] === "n" ? "No" : "Yes"),
        }
      )) === "No"
    ) {
      return;
    }

    await doCreateBfsw({ root: projectRoot, name: projectName, license: params.license }, ctx.logger);
  }
);
