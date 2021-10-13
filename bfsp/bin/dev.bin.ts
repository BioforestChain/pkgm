import { PromiseOut } from "@bfchain/util-extends-promise-out";
import fs from "node:fs";
import path from "node:path";
import type { RollupWatcher } from "rollup";
import { build as buildVite } from "vite";
import { getBfspProjectConfig, watchBfspProjectConfig, writeBfspProjectConfig } from "../src/bfspConfig";
import { Abortable } from "../src/toolkit";
import { ViteConfigFactory } from "./vite-build-config-factory";
import debug from "debug";

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

  const abortable = Abortable(async (aborter) => {
    /// 初始化终端的回调
    const devPo = new PromiseOut<RollupWatcher>();
    aborter.abortedCallback = async () => {
      const dev = await devPo.promise;
      dev.close();
      aborter.finishedAborted.resolve();
    };

    const userConfig = await subStreams.userConfigStream.getCurrent();
    const viteConfig = await subStreams.viteConfigStream.getCurrent();
    const packageJson = await subStreams.packageJsonStream.getCurrent();
    const tsConfig = await subStreams.tsConfigStream.getCurrent();
    const viteBuildConfig = await ViteConfigFactory({
      projectDirpath: root,
      viteConfig,
      packageJson,
      tsConfig,
      format: userConfig.userConfig.formats?.[0],
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

    log("running vite build!");
    const dev = (await buildVite(viteBuildConfig)) as RollupWatcher;
    devPo.resolve(dev);
  });

  /// 开始监听并触发编译
  subStreams.viteConfigStream.onNext(abortable.restart);
  if (subStreams.viteConfigStream.hasCurrent()) {
    abortable.start();
  }
})();
