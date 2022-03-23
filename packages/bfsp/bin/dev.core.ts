import { setTimeout as sleep } from "node:timers/promises";
import { PromiseOut } from "@bfchain/pkgm-base/util/extends_promise_out";
import { chalk } from "@bfchain/pkgm-base/lib/chalk";
import { isDeepStrictEqual } from "node:util";
import { watchBfspProjectConfig } from "../src/bfspConfig";
import { BuildService } from "../src/buildService";
import { createViteLogger, DevLogger } from "../src/logger";
import { Closeable } from "../src/toolkit";
import type { RollupWatcher } from "@bfchain/pkgm-base/lib/rollup";
import { build as buildBfsp } from "@bfchain/pkgm-base/lib/vite";
import { ViteConfigFactory } from "./vite/configFactory";
import { getTui } from "../src/tui";

type DevEventCallback = (name: string) => BFChainUtil.PromiseMaybe<void>;

export const doDev = async (options: {
  root?: string;
  format?: Bfsp.Format;
  buildService: BuildService;
  subStreams: ReturnType<typeof watchBfspProjectConfig>;
}) => {
  const debug = DevLogger("bfsp:bin/dev");
  const devPanel = getTui().getPanel("Dev");

  // const cwd = process.cwd();
  // const maybeRoot = path.join(cwd, process.argv.filter((a) => a.startsWith(".")).pop() || "");
  const { root = process.cwd(), format, buildService, subStreams } = options; //fs.existsSync(maybeRoot) && fs.statSync(maybeRoot).isDirectory() ? maybeRoot : cwd;

  debug("root", root);

  /// 监听项目变动
  let preViteConfigBuildOptions: BFChainUtil.FirstArgument<typeof ViteConfigFactory> | undefined;

  let startCb: DevEventCallback;
  let successCb: DevEventCallback;
  let errorCb: DevEventCallback;
  let abortable: ReturnType<typeof Closeable>;

  abortable = Closeable<string, string>("bin:dev", async (reasons) => {
    /**防抖，避免不必要的多次调用 */
    const closeSign = new PromiseOut<unknown>();
    (async () => {
      /// debounce
      await sleep(500);
      if (closeSign.is_finished) {
        debug("skip vite build by debounce");
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
        logger: devPanel.logger,
      };
      if (isDeepStrictEqual(viteConfigBuildOptions, preViteConfigBuildOptions)) {
        return;
      }
      preViteConfigBuildOptions = viteConfigBuildOptions;
      const viteBuildConfig = ViteConfigFactory(viteConfigBuildOptions);

      debug("running bfsp build!");
      //#region vite
      const viteLogger = createViteLogger(devPanel);
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
        debug("close bfsp build, reason: ", reason);
        preViteConfigBuildOptions = undefined;
        dev.close();
      });

      dev.on("change", (id, change) => {
        debug(`${change.event} file: ${id} `);
      });

      dev.on("event", async (event) => {
        const name = userConfig.userConfig.name;
        debug(`package ${name}: ${event.code}`);
        if (event.code === "START") {
          devPanel.updateStatus("loading");
          startCb && (await startCb(name));
          return;
        }
        // bundle结束，关闭watch
        if (event.code === "BUNDLE_END") {
          // close as https://www.rollupjs.org/guide/en/#rollupwatch suggests
          event.result.close();
          viteLogger.info(`${chalk.green("√")} package ${name} build complete`);
          devPanel.updateStatus("success");
          successCb && (await successCb(name));
          return;
        }
        if (event.code === "ERROR") {
          devPanel.updateStatus("error");
          errorCb && (await errorCb(name));
          return;
        }
      });
    })();

    return (reason: unknown) => {
      closeSign.resolve(reason);
    };
  });

  return {
    abortable: abortable!,
    onStart: (cb: DevEventCallback) => {
      startCb = cb;
    },
    onSuccess: (cb: DevEventCallback) => {
      successCb = cb;
    },
    onError: (cb: DevEventCallback) => {
      errorCb = cb;
    },
  };
};
