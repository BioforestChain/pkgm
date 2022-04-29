import { chalk } from "@bfchain/pkgm-base/lib/chalk";
import path from "node:path";
import { defineCommand } from "../bin";
import { doCreateBfsp } from "./create.core";
import { helpOptions } from "./help.core";
import { doInit } from "./init.core";

export const createCommand = defineCommand(
  "create",
  {
    params: [
      { type: "string", name: "license", description: "project license, default is MIT", require: false },
      { type: "string", name: "name", description: "project name, default is dirname", require: false },
    ],
    args: [[{ type: "string", name: "name", description: "project name, default is dirname" }], []],
    description: helpOptions.create,
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

    const logger = ctx.logger;

    /// 创建核心文件
    await doCreateBfsp({ root: projectRoot, name: projectName, license: params.license }, logger);

    /// 根据核心文件初始化配置与依赖安装
    const initSuccessed = await doInit({ root: projectRoot }, logger);
    if (initSuccessed === false) {
      logger.warn(`dependencies install failed, check your network.`);
    }

    /// print help docs
    logger.log(`project inited, run the following commands to start dev\n`);
    const relative_path = path.relative(process.cwd(), projectRoot);
    if (relative_path) {
      logger.log(chalk.blue(`cd ${relative_path}`));
    }
    if (initSuccessed === false) {
      logger.log(chalk.blue(`bfsp init`));
    }
    logger.log(chalk.blue(`bfsp dev`));
  }
);
