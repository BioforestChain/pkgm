import path from "node:path";
import { Loopable, SharedAsyncIterable, SharedFollower } from "../toolkit";
import type { $BfspUserConfig } from "./bfspUserConfig";
import type { $TsConfig } from "./tsConfig";
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

  console.log("viteInput", viteInput);

  return {
    viteInput,
  };
};
export type $ViteConfig = BFChainUtil.PromiseReturnType<typeof generateViteConfig>;
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
  /// 循环处理监听到的事件
  const looper = Loopable(async () => {
    const bfspUserConfig = await bfspUserConfigStream.getCurrent();
    const tsConfig = await tsConfigStream.getCurrent();
    const viteConfig = await generateViteConfig(projectDirpath, bfspUserConfig, tsConfig);
    console.log("viteConfig changed!!", viteConfig);
    follower.push(viteConfig);
  });

  //#region 监听依赖配置来触发更新
  bfspUserConfigStream.onNext(looper.loop);
  tsConfigStream.onNext(looper.loop);
  //#endregion

  looper.loop();
  return new SharedAsyncIterable<$ViteConfig>(follower);
};
