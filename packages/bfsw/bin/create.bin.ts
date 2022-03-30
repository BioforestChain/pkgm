import { chalk } from "@bfchain/pkgm-base/lib/chalk";
import { defineCommand, linkBFChainPkgmModules } from "@bfchain/pkgm-bfsp/sdk";
import path from "node:path";
import { WorkspaceConfig } from "../src/configs/workspaceConfig";
import { doCreateBfsw } from "./create.core";
import { doInit } from "./init.core";

export const createCommand = defineCommand(
  "create",
  {
    params: [
      { type: "string", name: "license", description: "project license, default is MIT", require: false },
      { type: "string", name: "name", description: "project name, default is dirname", require: false },
      { type: "boolean", name: "yes", description: "anwser all question by default value", require: false },
    ],
    args: [[{ type: "string", name: "name", description: "project name, default is dirname" }], []],
    description: `create a new bfsw project`,
  } as const,
  async (params, args, ctx) => {
    const workspaceRoot = path.resolve(process.cwd(), args[0] ?? ".");
    const workspaceName = params.name ?? path.basename(workspaceRoot);

    if (
      params.yes !== true &&
      (await ctx.question(
        `
      ${chalk.gray`Workspace Directory`}: ${chalk.cyan(workspaceRoot)}
      ${chalk.gray`Workspace Name`}: ${chalk.cyan(workspaceName)}
      ${chalk.gray`Confirm`}? ${chalk.gray(`[${chalk.cyan.underline`Y`}/n]`)}
    `,
        {
          map: (anwser) => (anwser.trim().toLowerCase()[0] === "n" ? "No" : "Yes"),
        }
      )) === "No"
    ) {
      return;
    }

    /// 先确保将 pkgm 的包安置好
    linkBFChainPkgmModules(workspaceRoot);

    /// 创建核心文件
    await doCreateBfsw({ root: workspaceRoot, name: workspaceName, license: params.license }, ctx.logger);

    const workspaceConfig = await WorkspaceConfig.From(workspaceRoot, ctx.logger);
    if (workspaceConfig === undefined) {
      throw new Error("#bfsw.ts load fail");
    }
    /// 根据核心文件初始化配置与依赖安装
    await doInit({ workspaceConfig }, ctx);

    // 销毁
    workspaceConfig.destroy();
  }
);
