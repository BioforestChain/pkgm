import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { Debug } from "../logger";
import { Loopable, SharedAsyncIterable, SharedFollower } from "../toolkit";
import type { $BfspUserConfig } from "./bfspUserConfig";
import type { $TsConfig } from "./tsConfig";
const log = Debug("bfsp:config/vite");
// import { $TsConfig } from "./tsConfig";
// import viteConfigTemplate from "../../assets/vite.config.template.ts?raw";

export const generateViteConfig = async (
  projectDirpath: string,
  bfspUserConfig: $BfspUserConfig,
  tsConfig: $TsConfig
) => {
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

  log("viteInput", viteInput);

  return {
    viteInput,
  };
};
export type $ViteConfig = Awaited<ReturnType<typeof generateViteConfig>>;
// import { resolve } from "node:path";
// import { fileIO } from "../toolkit";
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
  projectDirpath: string,
  bfspUserConfigStream: SharedAsyncIterable<$BfspUserConfig>,
  tsConfigStream: SharedAsyncIterable<$TsConfig>
) => {
  const follower = new SharedFollower<$ViteConfig>();

  let preViteConfig: $ViteConfig | undefined;
  /// 循环处理监听到的事件
  const looper = Loopable("watch viteConfig", async () => {
    const bfspUserConfig = await bfspUserConfigStream.getCurrent();
    const tsConfig = await tsConfigStream.getCurrent();
    const viteConfig = await generateViteConfig(projectDirpath, bfspUserConfig, tsConfig);
    if (isDeepStrictEqual(preViteConfig, viteConfig)) {
      return;
    }
    log("viteConfig changed!!", viteConfig);
    follower.push((preViteConfig = viteConfig));
  });

  //#region 监听依赖配置来触发更新
  bfspUserConfigStream.onNext(looper.loop);
  tsConfigStream.onNext(looper.loop);
  //#endregion

  looper.loop();
  return new SharedAsyncIterable<$ViteConfig>(follower);
};
