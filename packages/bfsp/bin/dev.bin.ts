import { chalk } from "@bfchain/pkgm-base/lib/chalk";
import path from "node:path";
import { defineCommand } from "../bin";
import { getTui, watchBfspProjectConfig, writeBfspProjectConfig } from "../src";
import { ALLOW_FORMATS, getBfspUserConfig } from "../src/configs/bfspUserConfig";
import { createTscLogger, DevLogger } from "../src/logger";
import { doDevBfsp } from "./dev.core";
import { helpOptions } from "./help.core";
import { runTsc } from "./tsc/runner";

export const devCommand = defineCommand(
  "dev",
  {
    params: [
      { type: "string", name: "format", description: "bundle format: esm or cjs, default is esm." },
      { type: "string", name: "profiles", description: "bundle profiles, default is ['default']." },
    ],
    args: [[{ type: "string", name: "path", description: "project path, default is cwd." }], []],
    description: helpOptions.dev,
  } as const,
  async (params, args) => {
    const debug = DevLogger("bfsp:bin/dev");
    let { format } = params;
    if (format !== undefined && ALLOW_FORMATS.has(format as any) === false) {
      debug.warn(`invalid format: '${format}'`);
      format = undefined;
    }

    const bundlePanel = getTui().getPanel("Dev");

    const profiles = params?.profiles?.split(",") || [];
    if (profiles.length === 0) {
      profiles.push("default");
    } else if (profiles.includes("default") === false) {
      bundlePanel.logger.warn(
        `your dev profiles is ${chalk.cyan(profiles.join(", "))}. no includes '${chalk.cyan("default")}'.`
      );
    }

    let root = process.cwd();
    const maybeRoot = args[0];
    if (maybeRoot !== undefined) {
      root = path.resolve(root, maybeRoot);
    }

    const tscLogger = createTscLogger();

    const bfspUserConfig = await getBfspUserConfig(root);
    const projectConfig = { projectDirpath: root, bfspUserConfig };
    /**使用特殊定制的logger */
    const options = { logger: getTui().getPanel("Dev").logger };

    const subConfigs = await writeBfspProjectConfig(projectConfig, options);
    const configStreams = watchBfspProjectConfig(projectConfig, subConfigs, options);

    /* const tscStoppable = */
    runTsc({
      watch: true,
      tsconfigPath: path.join(root, "tsconfig.json"),
      onMessage: (s) => tscLogger.write(s),
      onClear: () => tscLogger.clear(),
    });

    doDevBfsp({
      root,
      format: format as Bfsp.Format,
      subStreams: configStreams,
    });
  }
);
