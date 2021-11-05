import { sleep } from "@bfchain/util-extends-promise";
import { PromiseOut } from "@bfchain/util-extends-promise-out";
import chalk from "chalk";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { Worker } from "node:worker_threads";
import type { RollupWatcher } from "rollup";
import { build as buildBfsp } from "vite";
import { getBfspProjectConfig, watchBfspProjectConfig, writeBfspProjectConfig } from "../src/bfspConfig";
import { createDevTui, Debug } from "../src/logger";
import { Closeable } from "../src/toolkit";
import { runTsc } from "./tsc/runner";
import { ViteConfigFactory } from "./vite/configFactory";

export const doDev = async (options: { format?: Bfsp.Format; root?: string; profiles?: string[] }) => {
  const log = Debug("bfsp:bin/dev");
  const { createTscLogger, createViteLogger } = createDevTui();

  // const cwd = process.cwd();
  // const maybeRoot = path.join(cwd, process.argv.filter((a) => a.startsWith(".")).pop() || "");
  const { root = process.cwd(), format } = options; //fs.existsSync(maybeRoot) && fs.statSync(maybeRoot).isDirectory() ? maybeRoot : cwd;

  log("root", root);

  const config = await getBfspProjectConfig(root);

  /// 初始化写入配置
  const subConfigs = await writeBfspProjectConfig(config);

  /// 监听项目变动
  const subStreams = watchBfspProjectConfig(config!, subConfigs);

  let preViteConfigBuildOptions: BFChainUtil.FirstArgument<typeof ViteConfigFactory> | undefined;

  const abortable = Closeable<string, string>("bin:dev", async (reasons) => {
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

      //#region tsc

      const tscLogger = createTscLogger();
      const tscWatcher = runTsc({
        onClear: () => tscLogger.clear(),
        onMessage: (s) => tscLogger.write(s),
        tsconfigPath: path.join(root, "tsconfig.json"),
      });

      //#endregion

      closeSign.onSuccess((reason) => {
        log("close bfsp build, reason: ", reason);
        preViteConfigBuildOptions = undefined;
        dev.close();
        tscWatcher.stop();
      });
    })();

    return (reason: unknown) => {
      closeSign.resolve(reason);
    };
  });

  /// 开始监听并触发编译
  subStreams.userConfigStream.onNext(() => abortable.restart("userConfig changed"));
  subStreams.viteConfigStream.onNext(() => abortable.restart("viteConfig changed"));
  subStreams.tsConfigStream.onNext(() => abortable.restart("tsConfig changed"));
  if (subStreams.viteConfigStream.hasCurrent()) {
    abortable.start();
  }
};
