import path from "node:path";
import { defineCommand } from "../bin";
import { getTui, watchBfspProjectConfig, watchDeps, writeBfspProjectConfig } from "../src";
import { getBfspBuildService } from "../src/buildService";
import { ALLOW_FORMATS, getBfspUserConfig } from "../src/configs/bfspUserConfig";
import { createTscLogger, DevLogger } from "../src/logger";
import { watchSingle } from "../src/watcher";
import { doDev } from "./dev.core";
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

    const profiles = params?.profiles?.split(",") || [];
    if (profiles.length === 0) {
      profiles.push("default");
    }

    let root = process.cwd();
    let maybeRoot = args[0];
    if (maybeRoot !== undefined) {
      root = path.resolve(root, maybeRoot);
    }

    const tscLogger = createTscLogger();

    const buildService = getBfspBuildService(watchSingle());

    const bfspUserConfig = await getBfspUserConfig(root);
    const projectConfig = { projectDirpath: root, bfspUserConfig };
    const subConfigs = await writeBfspProjectConfig(projectConfig, buildService);
    const subStreams = watchBfspProjectConfig(projectConfig, buildService, subConfigs);
    const depStream = watchDeps(root, subStreams.packageJsonStream, { runYarn: true });

    /* const tscStoppable = */
    runTsc({
      watch: true,
      tsconfigPath: path.join(root, "tsconfig.json"),
      onMessage: (s) => tscLogger.write(s),
      onClear: () => tscLogger.clear(),
    });

    const task = await doDev({
      root,
      format: format as Bfsp.Format,
      buildService,
      subStreams,
    });
    const { abortable } = task;
    const bundlePanel = getTui().getPanel("Bundle");
    task.onSuccess(() => {
      bundlePanel.updateStatus("success");
    });
    task.onError(() => {
      bundlePanel.updateStatus("error");
    });
    task.onStart(() => {
      bundlePanel.updateStatus("loading");
    });
    /// 开始监听并触发编译
    subStreams.userConfigStream.onNext(() => abortable.restart("userConfig changed"));
    subStreams.viteConfigStream.onNext(() => abortable.restart("viteConfig changed"));
    subStreams.tsConfigStream.onNext(() => abortable.restart("tsConfig changed"));
    depStream.onNext(() => abortable.restart("deps installed "));
    if (subStreams.viteConfigStream.hasCurrent()) {
      abortable.start();
    }
  }
);
