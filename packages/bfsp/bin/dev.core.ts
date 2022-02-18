import { sleep } from "@bfchain/util-extends-promise";
import { PromiseOut } from "@bfchain/util-extends-promise-out";
import chalk from "chalk";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { Worker } from "node:worker_threads";
import type { RollupWatcher } from "./shim";
import { buildBfsp } from "./shim";
import { $BfspUserConfig, getBfspUserConfig } from "../src";
import { watchBfspProjectConfig, writeBfspProjectConfig } from "../src/bfspConfig";
import { BuildService } from "../src/buildService";
import { watchDeps } from "../src/deps";
import { createTscLogger, createViteLogger, Debug } from "../src/logger";
import { Closeable, SharedAsyncIterable } from "../src/toolkit";
import { ViteConfigFactory } from "./vite/configFactory";

export const doDev = async (options: {
  root?: string;
  format?: Bfsp.Format;
  buildService: BuildService;
  subStreams: ReturnType<typeof watchBfspProjectConfig>;
}) => {
  const log = Debug("bfsp:bin/dev");

  // const cwd = process.cwd();
  // const maybeRoot = path.join(cwd, process.argv.filter((a) => a.startsWith(".")).pop() || "");
  const { root = process.cwd(), format, buildService, subStreams } = options; //fs.existsSync(maybeRoot) && fs.statSync(maybeRoot).isDirectory() ? maybeRoot : cwd;

  log("root", root);

  /// 监听项目变动
  let preViteConfigBuildOptions: BFChainUtil.FirstArgument<typeof ViteConfigFactory> | undefined;

  let doneCb: (name: string) => BFChainUtil.PromiseMaybe<void>;
  let abortable: ReturnType<typeof Closeable>;

  abortable = Closeable<string, string>("bin:dev", async (reasons) => {
    /**防抖，避免不必要的多次调用 */
    const closeSign = new PromiseOut<unknown>();
    (async () => {
      /// debounce
      await sleep(500);
      if (closeSign.is_finished) {
        log("skip vite build by debounce");
        return;
      }

      const userConfig = await subStreams.userConfigStream.getCurrent();
      const viteConfig = await subStreams.viteConfigStream.getCurrent();
      const tsConfig = await subStreams.tsConfigStream.getCurrent();

      const viteConfigBuildOptions = {
        buildService,
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
      //#region vite
      const viteLogger = createViteLogger("info", {});
      const dev = (await buildBfsp({
        ...viteBuildConfig,
        build: {
          ...viteBuildConfig.build,
          minify: false,
          sourcemap: true,
          rollupOptions: {
            ...viteBuildConfig.build?.rollupOptions,
            onwarn: (err) => viteLogger.warn(chalk.yellow(String(err))),
          },
        },
        mode: "development",
        customLogger: viteLogger,
      })) as RollupWatcher;
      //#endregion

      closeSign.onSuccess((reason) => {
        log("close bfsp build, reason: ", reason);
        preViteConfigBuildOptions = undefined;
      });

      dev.on("change", (id, change) => {
        viteLogger.info(`${change.event} file: ${id} `);
      });

      dev.on("event", async (event) => {
        viteLogger.info(`event: ${event.code}`);
        // bundle结束，关闭watch
        if (event.code === "BUNDLE_END") {
          doneCb && (await doneCb(userConfig.userConfig.name));
        }
      });
    })();

    return (reason: unknown) => {
      closeSign.resolve(reason);
    };
  });

  return {
    abortable: abortable!,
    onDone: (cb: (name: string) => BFChainUtil.PromiseMaybe<void>) => {
      doneCb = cb;
    },
  };
};
