import path from "node:path";
import { SharedAsyncIterable, SharedFollower } from "../toolkit";
import { $BfspUserConfig } from "../userConfig";
// import { $TsConfig } from "./tsConfig";
// import viteConfigTemplate from "../../assets/vite.config.template.ts?raw";

export const generateViteConfig = async (
  projectDirpath: string,
  bfspUserConfig: $BfspUserConfig
) => {
  const viteInput: {
    [entryAlias: string]: string;
  } = {};
  for (const [output, input] of bfspUserConfig.exportsDetail.exportsMap
    .oi_cache) {
    viteInput[output] = path.join(projectDirpath, input);
  }

  return {
    viteInput,
  };
};
export type $ViteConfig = BFChainUtil.PromiseReturnType<
  typeof generateViteConfig
>;
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
  bfspUserConfigStream: SharedAsyncIterable<$BfspUserConfig>
) => {
  const follower = new SharedFollower<$ViteConfig>();
  /// 循环处理监听到的事件
  let running = false;
  const loopProcesser = async () => {
    if (running) {
      return;
    }
    running = true;

    const bfspUserConfig = await bfspUserConfigStream.getCurrent();
    follower.push(await generateViteConfig(projectDirpath, bfspUserConfig));
  };

  //#region 监听依赖配置来触发更新
  bfspUserConfigStream.onNext(loopProcesser);
  //#endregion

  return new SharedAsyncIterable<$ViteConfig>(follower);
};
