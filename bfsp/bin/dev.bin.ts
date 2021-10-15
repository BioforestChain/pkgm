import { PromiseOut } from "@bfchain/util-extends-promise-out";
import fs from "node:fs";
import path from "node:path";
import type { RollupWatcher } from "rollup";
import { build as buildBfsp } from "vite";
import { getBfspProjectConfig, watchBfspProjectConfig, writeBfspProjectConfig } from "../src/bfspConfig";
import { Closeable } from "../src/toolkit";
import { ViteConfigFactory } from "./vite-build-config-factory";
import debug from "debug";
import { sleep } from "@bfchain/util-extends-promise";
import { createViteLogger } from "../src/logger";

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

      log("running bfsp build!");
      debugger
      const dev = (await buildBfsp({
        ...viteBuildConfig,
        build: {
          ...viteBuildConfig.build,
          minify: false,
          sourcemap: true,
        },
        mode: "development",
        customLogger: createViteLogger("info", {}),
      })) as RollupWatcher;

      debounce.onSuccess((reason) => {
        log("close bfsp build, reason: ", reason);
        dev.close();
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
