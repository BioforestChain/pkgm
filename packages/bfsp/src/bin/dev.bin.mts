import { chalk } from "@bfchain/pkgm-base/lib/chalk.mjs";
import path from "node:path";
import { defineCommand } from "../bin.mjs";
import {
  BFSP_MODE, getBfspProjectConfig, watchBfspProjectConfig,
  writeBfspProjectConfig
} from "../main/bfspConfig.mjs";
import { DevLogger } from "../sdk/logger/logger.mjs";
import { toAllowedJsFormat } from "../sdk/toolkit/toolkit.fs.mjs";
import { getTui } from "../sdk/tui/index.mjs";
import { doDevBfsp } from "./dev.core.mjs";
import { helpOptions } from "./help.core.mjs";

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
    const format = toAllowedJsFormat(params.format);
    if (format === undefined && params.format) {
      debug.warn(`invalid format: '${params.format}'`);
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

    const logger = getTui().getPanel("Dev").logger;
    try {
      const options = { logger: logger };

      const bfspProjectConfig = await getBfspProjectConfig(root, BFSP_MODE.DEV, options);
      /**使用特殊定制的logger */

      const subConfigs = await writeBfspProjectConfig(bfspProjectConfig, options);
      const configStreams = watchBfspProjectConfig(bfspProjectConfig, subConfigs, options);

      /* const tscStoppable = */
      // runTsc({
      //   watch: true,
      //   tsconfigPath: path.join(root, "tsconfig.json"),
      //   onMessage: (s) => tscLogger.write(s),
      //   onClear: () => tscLogger.clear(),
      // });

      doDevBfsp({
        root,
        format,
        subStreams: configStreams,
      });
    } catch (err) {
      logger.error(err);
    }
  }
);
