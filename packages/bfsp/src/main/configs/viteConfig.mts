import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { DevLogger } from "../../sdk/logger/logger.mjs";
import { Loopable, SharedAsyncIterable, SharedFollower } from "../../sdk/toolkit/toolkit.stream.mjs";
import { $BfspEnvConfig } from "../bfspConfig.mjs";
import type { $BfspUserConfig } from "./bfspUserConfig.mjs";
import type { $TsConfig } from "./tsConfig.mjs";
const debug = DevLogger("bfsp:config/vite");

export const generateViteConfig = async (
  bfspEnvConfig: $BfspEnvConfig,
  bfspUserConfig: $BfspUserConfig,
  tsConfig: $TsConfig
) => {
  const { projectDirpath } = bfspEnvConfig;
  const viteInput: {
    [entryAlias: string]: string;
  } = {};
  const { exportsMap } = bfspUserConfig.exportsDetail;
  for (const [output, input] of exportsMap.oi) {
    viteInput[output] = path.join(projectDirpath, input);
  }

  // for(const [output,input] of exportsMap)
  for (const filepath of tsConfig.tsFilesLists.testFiles) {
    if (exportsMap.hasInput(filepath)) {
      continue;
    }
    const output = exportsMap.autoOutput(filepath, path.parse(filepath).name);
    viteInput[output] = path.join(projectDirpath, filepath);
  }
  for (const filepath of tsConfig.tsFilesLists.binFiles) {
    if (exportsMap.hasInput(filepath)) {
      continue;
    }
    const output = exportsMap.autoOutput(filepath, path.parse(filepath).name);
    viteInput[output] = path.join(projectDirpath, filepath);
  }

  debug("viteInput", viteInput);

  return {
    viteInput,
  };
};
export type $ViteConfig = Awaited<ReturnType<typeof generateViteConfig>>;
// import { resolve } from "node:path";
// import { fileIO } from "../toolkit.mjs";
// export const writeViteConfig = (
//   projectDirpath: string,
//   viteConfig: $ViteConfig
// ) => {
//   return fileIO.set(
//     resolve(projectDirpath, "vite.config.ts"),
//     Buffer.from(viteConfig.viteConfigContent)
//   );
// };

export const watchViteConfig = (
  bfspEnvConfig: $BfspEnvConfig,
  bfspUserConfigStream: SharedAsyncIterable<$BfspUserConfig>,
  tsConfigStream: SharedAsyncIterable<$TsConfig>
) => {
  const { projectDirpath } = bfspEnvConfig;
  const follower = new SharedFollower<$ViteConfig>();

  let preViteConfig: $ViteConfig | undefined;
  /// 循环处理监听到的事件
  const looper = Loopable("watch viteConfig", async () => {
    const bfspUserConfig = await bfspUserConfigStream.waitCurrent();
    const tsConfig = await tsConfigStream.waitCurrent();
    const viteConfig = await generateViteConfig(bfspEnvConfig, bfspUserConfig, tsConfig);
    if (isDeepStrictEqual(preViteConfig, viteConfig)) {
      return;
    }
    debug("viteConfig changed!!", viteConfig);
    follower.push((preViteConfig = viteConfig));
  });

  //#region 监听依赖配置来触发更新
  bfspUserConfigStream.onNext(looper.loop);
  tsConfigStream.onNext(looper.loop);
  //#endregion

  looper.loop();
  return new SharedAsyncIterable<$ViteConfig>(follower);
};
