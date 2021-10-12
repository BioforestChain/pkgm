import { PromiseOut } from "@bfchain/util-extends-promise-out";
import fs from "node:fs";
import path from "node:path";
import type { RollupWatcher } from "rollup";
import { build } from "vite";
import {
  getBfspProjectConfig,
  watchBfspProjectConfig,
  writeBfspProjectConfig,
} from "../src/bfspConfig";
import { generateViteConfig } from "../src/gen/viteConfig";
import { watchBfspUserConfig } from "../src/userConfig";
import { ViteConfigFactory } from "./vite-build-config-factory";

(async () => {
  const cwd = process.cwd();
  const maybeRoot = path.join(
    cwd,
    process.argv.filter((a) => a.startsWith(".")).pop() || ""
  );
  const root =
    fs.existsSync(maybeRoot) && fs.statSync(maybeRoot).isDirectory()
      ? maybeRoot
      : cwd;

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

  let watchController: { close(): Promise<void> } | undefined;
  let watchLock = false;
  const doWatch = async () => {
    //#region 加锁

    if (watchLock) {
      return;
    }
    if (watchController) {
      watchLock = true;
      await watchController.close();
      watchLock = false;
    }

    const input = new PromiseOut<void>();
    const output = new PromiseOut<void>();
    watchController = {
      close() {
        input.resolve();
        return output.promise;
      },
    };
    //#endregion

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

    const devOut = (await build(viteBuildConfig)) as RollupWatcher;

    /// 监听锁
    input.onFinished(() => {
      devOut.close();
      output.resolve();
    });
  };

  /// 开始监听并触发编译
  subStreams.viteConfigStream.onNext(doWatch);
  if (subStreams.viteConfigStream.hasCurrent()) {
    doWatch();
  }
})();
