import { PromiseOut } from "@bfchain/pkgm-base/util/extends_promise_out";
import { chalk } from "@bfchain/pkgm-base/lib/chalk";
import { isDeepStrictEqual } from "node:util";
import { watchBfspProjectConfig } from "../src/bfspConfig";
import { createTscLogger, createViteLogger, DevLogger } from "../sdk/logger/logger";
import { Closeable } from "../sdk/toolkit/toolkit.stream";
import type { RollupWatcher } from "@bfchain/pkgm-base/lib/rollup";
import { getVite } from "@bfchain/pkgm-base/lib/vite";
import { ViteConfigFactory } from "./vite/configFactory";
import { $LoggerKit, getTui } from "../sdk/tui";
import { TypingsGenerator, type ModeType } from "./typingsGenerator";

type DevEventCallback = (name: string) => BFChainUtil.PromiseMaybe<void>;

export const doDevBfsp = (
  args: {
    root: string;
    format?: Bfsp.Format;
    subStreams: ReturnType<typeof watchBfspProjectConfig>;
  },
  options: {
    loggerKit?: $LoggerKit;
    mode?: ModeType;
  } = {}
) => {
  const debug = DevLogger("bfsp:bin/dev");
  const { loggerKit = getTui().getPanel("Dev").viteLoggerKit } = options;
  const logger = loggerKit.logger;
  const devPanel = getTui().getPanel("Dev");
  const { root = process.cwd(), format, subStreams } = args;
  const tscLogger = createTscLogger();

  debug("root", root);

  /// 监听项目变动
  let preViteConfigBuildOptions: BFChainUtil.FirstArgument<typeof ViteConfigFactory> | undefined;

  let typingsGenerator: TypingsGenerator | undefined;
  let startCb: DevEventCallback;
  let successCb: DevEventCallback;
  let errorCb: DevEventCallback;
  let abortable: ReturnType<typeof Closeable>;

  abortable = Closeable<string, string>(
    "bin:dev",
    async (reasons) => {
      /**防抖，避免不必要的多次调用 */
      const closeSign = new PromiseOut<unknown>();
      (async () => {
        const userConfig = await subStreams.userConfigStream.waitCurrent();
        const viteConfig = await subStreams.viteConfigStream.waitCurrent();
        const tsConfig = await subStreams.tsConfigStream.waitCurrent();

        typingsGenerator = new TypingsGenerator({ root, logger: tscLogger, tsConfig, mode: options?.mode });
        await typingsGenerator.generate(userConfig.exportsDetail.indexFile);

        const viteConfigBuildOptions = {
          userConfig: userConfig.userConfig,
          projectDirpath: root,
          viteConfig,
          tsConfig,
          format: format ?? userConfig.userConfig.formats?.[0],
          logger,
        };
        if (isDeepStrictEqual(viteConfigBuildOptions, preViteConfigBuildOptions)) {
          return;
        }
        preViteConfigBuildOptions = viteConfigBuildOptions;
        const viteBuildConfig = ViteConfigFactory(viteConfigBuildOptions);

        debug("running bfsp build!");
        //#region vite
        const viteLogger = createViteLogger(loggerKit);
        getTui().debug("start vite");
        const dev = (await getVite().build({
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
          typingsGenerator?.stop();
          typingsGenerator = undefined;
        });

        dev.on("change", (id, change) => {
          debug(`${change.event} file: ${id} `);
        });

        dev.on("event", async (event) => {
          const name = userConfig.userConfig.name;
          debug(`package ${name}: ${event.code}`);
          if (event.code === "START") {
            devPanel.updateStatus("loading");
            loggerKit.clearScreen();
            startCb && (await startCb(name));
            return;
          }
          // bundle结束，关闭watch
          if (event.code === "BUNDLE_END") {
            // close as https://www.rollupjs.org/guide/en/#rollupwatch suggests
            event.result.close();
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
    },
    500
  );

  /// 开始监听并触发编译
  subStreams.userConfigStream.onNext(() => abortable.restart("userConfig changed"));
  subStreams.viteConfigStream.onNext(() => abortable.restart("viteConfig changed"));
  subStreams.tsConfigStream.onNext(() => abortable.restart("tsConfig changed"));
  subStreams.getDepsInstallStream().onNext((state) => {
    switch (state) {
      case "start":
        /// 开始安装依赖时，暂停编译，解除文件占用
        abortable.close(); // @todo pause
        break;
      case "success": /// 依赖安装成功
        abortable.restart("deps installed");
        break;
      case "fail":
        /// 依赖安装失败时，文件缺失，暂停编译
        abortable.close(); // @todo pause
        break;
    }
  });

  /// 如果配置齐全，那么直接开始
  logger.info("subStreams.viteConfigStream.hasCurrent()", subStreams.viteConfigStream.hasCurrent());
  logger.info("subStreams.getDepsInstallStream().current", subStreams.getDepsInstallStream().current);
  if (subStreams.viteConfigStream.hasCurrent() && subStreams.getDepsInstallStream().current === "success") {
    abortable.start();
  }

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
