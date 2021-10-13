import { PromiseOut } from "@bfchain/util-extends-promise-out";
import fs from "node:fs";
import path from "node:path";
import type { RollupWatcher } from "rollup";
import { build } from "vite";
import { getBfspProjectConfig, watchBfspProjectConfig, writeBfspProjectConfig } from "../src/bfspConfig";
import { generateViteConfig } from "../src/configs/viteConfig";
import { watchBfspUserConfig } from "../src/configs/bfspUserConfig";
import { ViteConfigFactory } from "./vite-build-config-factory";
import { Abortable } from "../src/toolkit";

(async () => {
  const cwd = process.cwd();
  const maybeRoot = path.join(cwd, process.argv.filter((a) => a.startsWith(".")).pop() || "");
  const root = fs.existsSync(maybeRoot) && fs.statSync(maybeRoot).isDirectory() ? maybeRoot : cwd;

  console.log("root", root);

  const config = await getBfspProjectConfig(root);
  if (config === undefined) {
    console.error("no found #bfsp project");
    process.exit(1);
  }

  /// 初始化写入配置
  const subConfigs = await writeBfspProjectConfig(config);

  /// 监听项目变动
  const subStreams = watchBfspProjectConfig(config!, {
    tsConfig: subConfigs.tsConfig,
  });

  const abortable = Abortable(async (aborter) => {
    /// 初始化终端的回调
    const devPo = new PromiseOut<RollupWatcher>();
    aborter.abortedCallback = async () => {
      const dev = await devPo.promise;
      dev.close();
      aborter.finishedAborted.resolve();
    };

    const viteConfig = await subStreams.viteConfigStream.getCurrent();
    const viteBuildConfig = await ViteConfigFactory({
      projectDirpath: root,
      viteConfig,
    });

    viteBuildConfig.build = {
      ...viteBuildConfig.build!,
      watch: {
        clearScreen: false,
      },
      minify: false,
      sourcemap: true,
    };
    viteBuildConfig.mode = "development";

    console.log("running esbuild!!!");
    const dev = (await build(viteBuildConfig)) as RollupWatcher;
    devPo.resolve(dev);
  });

  /// 开始监听并触发编译
  subStreams.viteConfigStream.onNext(abortable.restart);
  if (subStreams.viteConfigStream.hasCurrent()) {
    abortable.start();
  }
})();
