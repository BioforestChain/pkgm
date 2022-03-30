import path from "node:path";
import { defineCommand } from "../bin";
import { getTui } from "../sdk/tui";
import { DevLogger } from "../sdk/logger/logger";
import { doBuild, writeBuildConfigs } from "./build.core";
import { helpOptions } from "./help.core";
import { linkBFChainPkgmModules } from "./yarn/runner";

export const buildCommand = defineCommand(
  "build",
  {
    params: [
      { type: "string", name: "format", description: "bundle format: esm or cjs, default is esm." },
      { type: "string", name: "profiles", description: "bundle profiles, default is ['default']." },
    ],
    args: [[{ type: "string", name: "path", description: "project path, default is cwd." }], []],
    description: helpOptions.build,
  } as const,
  async (params, args, ctx) => {
    const warn = DevLogger("bfsp:bin/build");
    const debug = DevLogger("bfsp:bin/build");

    const profiles = params?.profiles?.split(",") || [];
    if (profiles.length === 0) {
      profiles.push("default");
    }
    let root = process.cwd();
    let maybeRoot = args[0];
    if (maybeRoot !== undefined) {
      root = path.resolve(root, maybeRoot);
    }

    /// 使用tui的logger，而不是ctx的logger
    const logger = getTui().getPanel("Build").logger;

    /// 先确保将 pkgm 的包安置好
    linkBFChainPkgmModules(root);

    /// 生成初始配置文件
    const cfgs = await writeBuildConfigs({ root }, { logger });

    /// 开始编译工作
    doBuild({ root, cfgs });
  }
);
