import { sleep } from "@bfchain/util-extends-promise";
import { PromiseOut } from "@bfchain/util-extends-promise-out";
import chalk from "chalk";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { Worker } from "node:worker_threads";
import type { RollupWatcher } from "rollup";
import { build as buildBfsp } from "vite";
import { $BfspUserConfig } from "../src";
import { watchBfspProjectConfig, writeBfspProjectConfig } from "../src/bfspConfig";
import { Debug } from "../src/logger";
import { multiDevTui } from "../src/multi";
import { Closeable, SharedAsyncIterable } from "../src/toolkit";
import { runTsc } from "./tsc/runner";
import { ViteConfigFactory } from "./vite/configFactory";

export const doDev = (options: {
  root?: string;
  format?: Bfsp.Format;
  streams: ReturnType<typeof watchBfspProjectConfig>;
  depStream: SharedAsyncIterable<boolean>;
}) => {
  const log = Debug("bfsp:bin/dev");

  // const cwd = process.cwd();
  // const maybeRoot = path.join(cwd, process.argv.filter((a) => a.startsWith(".")).pop() || "");
  const { root = process.cwd(), format } = options; //fs.existsSync(maybeRoot) && fs.statSync(maybeRoot).isDirectory() ? maybeRoot : cwd;

  log("root", root);

  /// 监听项目变动
  const subStreams = options.streams;
  let preViteConfigBuildOptions: BFChainUtil.FirstArgument<typeof ViteConfigFactory> | undefined;

  let dev: RollupWatcher;
  return {
    async start(options: { stateReporter: (s: string) => void }) {
      const report = options.stateReporter;
      const userConfig = await subStreams.userConfigStream.getCurrent();
      const viteConfig = await subStreams.viteConfigStream.getCurrent();
      const tsConfig = await subStreams.tsConfigStream.getCurrent();

      const viteConfigBuildOptions = {
        userConfig: userConfig.userConfig,
        projectDirpath: root,
        viteConfig,
        tsConfig,
        format: format ?? userConfig.userConfig.formats?.[0],
      };
      if (isDeepStrictEqual(viteConfigBuildOptions, preViteConfigBuildOptions)) {
        return;
      }
      preViteConfigBuildOptions = viteConfigBuildOptions;
      const viteBuildConfig = ViteConfigFactory(viteConfigBuildOptions);

      log("running bfsp build!");
      report(`${userConfig.userConfig.name} > vite build`);
      //#region vite
      const viteLogger = multiDevTui.createViteLogger("info", {});
      dev = (await buildBfsp({
        ...viteBuildConfig,
        build: {
          ...viteBuildConfig.build,
          minify: false,
          sourcemap: true,
          rollupOptions: {
            ...viteBuildConfig.build?.rollupOptions,
            onwarn: (err) => viteLogger.warn(chalk.yellow(String(err))),
          },
          watch: null, // 不watch， 任务一次结束
        },
        mode: "development",
        customLogger: viteLogger,
      })) as RollupWatcher;
      report(`${userConfig.userConfig.name} > done`);
    },
    async stop() {
      dev.close();
      preViteConfigBuildOptions = undefined;
    },
  };
};
