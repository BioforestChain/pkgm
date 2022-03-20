import { chalk } from "@bfchain/pkgm-base/lib/chalk";
import path from "node:path";
import { defineCommand } from "../bin";
import { getTui, watchBfspProjectConfig, doWatchDeps, writeBfspProjectConfig } from "../src";
import { getBfspBuildService } from "../src/buildService";
import { ALLOW_FORMATS, getBfspUserConfig } from "../src/configs/bfspUserConfig";
import { createTscLogger, DevLogger } from "../src/logger";
import { watchSingle } from "../src/watcher";
import { doDev as doDevBundle } from "./dev.core";
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

    const buildService = getBfspBuildService(watchSingle());

    const bfspUserConfig = await getBfspUserConfig(root);
    const projectConfig = { projectDirpath: root, bfspUserConfig };
    const subConfigs = await writeBfspProjectConfig(projectConfig, buildService);
    const configStreams = watchBfspProjectConfig(projectConfig, buildService, subConfigs);
    // const { stream: depStream,onSt }
    const wathDeps = doWatchDeps(root, configStreams.packageJsonStream, { runInstall: true });

    /* const tscStoppable = */
    runTsc({
      watch: true,
      tsconfigPath: path.join(root, "tsconfig.json"),
      onMessage: (s) => tscLogger.write(s),
      onClear: () => tscLogger.clear(),
    });

    const devBundle = await doDevBundle({
      root,
      format: format as Bfsp.Format,
      buildService,
      subStreams: configStreams,
    });
    const { abortable } = devBundle;
    /// 开始监听并触发编译
    configStreams.userConfigStream.onNext(() => abortable.restart("userConfig changed"));
    configStreams.viteConfigStream.onNext(() => abortable.restart("viteConfig changed"));
    configStreams.tsConfigStream.onNext(() => abortable.restart("tsConfig changed"));
    wathDeps.stream.onNext(() => abortable.restart("deps installed"));
    wathDeps.onStartInstall = () => {
      abortable.close();
    };
    if (configStreams.viteConfigStream.hasCurrent()) {
      abortable.start();
    }
  }
);
