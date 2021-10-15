import { sleep } from "@bfchain/util-extends-promise";
import { PromiseOut } from "@bfchain/util-extends-promise-out";
import chalk from "chalk";
import fs from "node:fs";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import type { RollupWatcher } from "rollup";
import { build as buildBfsp } from "vite";
import { getBfspProjectConfig, watchBfspProjectConfig, writeBfspProjectConfig } from "../src/bfspConfig";
import { createTscLogger, createViteLogger, debug } from "../src/logger";
import { Closeable } from "../src/toolkit";
import { ViteConfigFactory } from "./vite-build-config-factory";

(async () => {
  const log = debug("bfsp:bin/dev");

  const cwd = process.cwd();
  const maybeRoot = path.join(cwd, process.argv.filter((a) => a.startsWith(".")).pop() || "");
  const root = fs.existsSync(maybeRoot) && fs.statSync(maybeRoot).isDirectory() ? maybeRoot : cwd;

  log("root", root);

  const config = await getBfspProjectConfig(root);

  /// 初始化写入配置
  const subConfigs = await writeBfspProjectConfig(config);

  /// 监听项目变动
  const subStreams = watchBfspProjectConfig(config!, {
    tsConfig: subConfigs.tsConfig,
    packageJson: subConfigs.packageJson,
  });

  const abortable = Closeable("bin:dev", async () => {
    /**防抖，避免不必要的多次调用 */
    const debounce = new PromiseOut<unknown>();
    (async () => {
      await sleep(500);
      if (debounce.is_finished) {
        log("skip vite build by debounce");
        return;
      }

      const userConfig = await subStreams.userConfigStream.getCurrent();
      const viteConfig = await subStreams.viteConfigStream.getCurrent();
      const packageJson = await subStreams.packageJsonStream.getCurrent();
      const tsConfig = await subStreams.tsConfigStream.getCurrent();

      const viteBuildConfig = ViteConfigFactory({
        projectDirpath: root,
        viteConfig,
        packageJson,
        tsConfig,
        format: userConfig.userConfig.formats?.[0],
      });
      debugger;

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

      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const tsconfigPath = path.join(root, "tsconfig.json");
      const tscWorker = new Worker(path.join(__dirname, "./tsc.mjs"), {
        argv: ["--build", tsconfigPath, "-w"],
        stdin: true,
        stdout: true,
        stderr: true,
      });
      const tscLogger = createTscLogger();
      tscWorker.on("message", (data) => {
        if (data === "clearScreen") {
          tscLogger.clear();
        } else if (Array.isArray(data) && data[0] === "write") {
          tscLogger.write(data[1]);
        }
      });
      //#endregion

      debounce.onSuccess((reason) => {
        log("close bfsp build, reason: ", reason);
        dev.close();
        tscWorker.terminate();
      });
    })();

    return (reason: unknown) => {
      debounce.resolve(reason);
    };
  });

  /// 开始监听并触发编译
  subStreams.userConfigStream.onNext(abortable.restart);
  subStreams.packageJsonStream.onNext(abortable.restart);
  subStreams.viteConfigStream.onNext(abortable.restart);
  subStreams.tsConfigStream.onNext(abortable.restart);
  if (subStreams.viteConfigStream.hasCurrent()) {
    abortable.start();
  }
})();
