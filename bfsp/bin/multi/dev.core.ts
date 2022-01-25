import { sleep } from "@bfchain/util-extends-promise";
import { PromiseOut } from "@bfchain/util-extends-promise-out";
import chalk from "chalk";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { Worker } from "node:worker_threads";
import type { RollupWatcher } from "rollup";
import { build as buildBfsp } from "vite";
import { $BfspUserConfig, getBfspUserConfig } from "../../src";
import { watchBfspProjectConfig, writeBfspProjectConfig } from "../../src/bfspConfig";
import { BuildService } from "../../src/core";
import { watchDeps } from "../../src/deps";
import { createViteLogger, Debug } from "../../src/logger";
import { Closeable, SharedAsyncIterable } from "../../src/toolkit";
import { runTsc } from "../tsc/runner";
import { ViteConfigFactory } from "../vite/configFactory";
import { TaskSerial } from "../../src/workspace";

export const workspaceItemDoDev = async (options: {
  root?: string;
  format?: Bfsp.Format;
  buildService: BuildService;
}) => {
  const log = Debug("bfsp:bin/dev");

  // const cwd = process.cwd();
  // const maybeRoot = path.join(cwd, process.argv.filter((a) => a.startsWith(".")).pop() || "");
  const { root = process.cwd(), format, buildService } = options; //fs.existsSync(maybeRoot) && fs.statSync(maybeRoot).isDirectory() ? maybeRoot : cwd;

  log("root", root);
  const bfspUserConfig = await getBfspUserConfig(root);
  const projectConfig = { projectDirpath: root, bfspUserConfig };
  const subConfigs = await writeBfspProjectConfig(projectConfig, buildService);
  const subStreams = watchBfspProjectConfig(projectConfig, buildService, subConfigs);
  const depStream = watchDeps(root, subStreams.packageJsonStream);

  /// 监听项目变动
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
        // TODO: watcher统一管理
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
        // dev.close();
      });

      dev.on("event", (event) => {
        // bundle结束，关闭watch
        if(event.code === "BUNDLE_END") {
          dev.close();
        }
      });

      dev.on("close", () => {
        // watch池中任务完成一个，可以继续添加任务
        TaskSerial.activeWatcherNums--;
      });
    })();

    return (reason: unknown) => {
      closeSign.resolve(reason);
    };
  });

  /// 开始监听并触发编译
  // subStreams.userConfigStream.onNext(() => abortable.restart("userConfig changed"));
  // subStreams.viteConfigStream.onNext(() => abortable.restart("viteConfig changed"));
  // subStreams.tsConfigStream.onNext(() => abortable.restart("tsConfig changed"));
  // depStream.onNext(() => abortable.restart("deps installed "));
  subStreams.userConfigStream.onNext(() => {
    TaskSerial.push(bfspUserConfig.userConfig.name);
  });
  subStreams.viteConfigStream.onNext(() => {
    TaskSerial.push(bfspUserConfig.userConfig.name);
  });
  subStreams.tsConfigStream.onNext(() => {
    TaskSerial.push(bfspUserConfig.userConfig.name);
  });
  depStream.onNext(() => {
    TaskSerial.push(bfspUserConfig.userConfig.name);
  });

  if (subStreams.viteConfigStream.hasCurrent()) {
    TaskSerial.push(bfspUserConfig.userConfig.name);
  }
  return abortable;
};
