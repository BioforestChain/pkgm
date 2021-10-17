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
import { ViteConfigFactory } from "./vite-build-config-factory";

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

      const viteConfigBuildOptions = {
        projectDirpath: root,
        viteConfig,
        packageJson,
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

      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const tsconfigPath = path.join(root, "tsconfig.json");
      const tscWorker = new Worker(path.join(__dirname, "./tsc_worker.mjs"), {
        argv: ["--build", tsconfigPath, "-w"],
        stdin: false,
        stdout: false,
        stderr: false,
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
  subStreams.userConfigStream.onNext(() => (log("userConfig changed"), abortable.restart()));
  subStreams.packageJsonStream.onNext(() => (log("packageJson changed"), abortable.restart()));
  subStreams.viteConfigStream.onNext(() => (log("viteConfig changed"), abortable.restart()));
  subStreams.tsConfigStream.onNext(() => (log("tsConfig changed"), abortable.restart()));
  if (subStreams.viteConfigStream.hasCurrent()) {
    abortable.start();
  }
};
