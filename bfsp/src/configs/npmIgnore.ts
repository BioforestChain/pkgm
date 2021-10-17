import { resolve } from "node:path";
import { Debug } from "../logger";
import { fileIO, isEqualSet, Loopable, SharedAsyncIterable, SharedFollower } from "../toolkit";
import { $BfspUserConfig } from "./bfspUserConfig";
import { effectConfigIgnores } from "./commonIgnore";
import { defaultGitIgnores } from "./gitIgnore";
export const defaultNpmIgnores = new Set(defaultGitIgnores);
// 测试文件夹默认不导出
defaultNpmIgnores.add("tests");
defaultNpmIgnores.delete("package.json");

export const generateNpmIgnore = async (projectDirpath: string, config: Bfsp.UserConfig) => {
  return effectConfigIgnores(defaultNpmIgnores, config.npmignore);
};

export type $NpmIgnore = BFChainUtil.PromiseReturnType<typeof generateNpmIgnore>;

export const writeNpmIgnore = (projectDirpath: string, npmIgnore: $NpmIgnore) => {
  return fileIO.set(resolve(projectDirpath, ".npmignore"), Buffer.from([...npmIgnore].join("\n")));
};
const log = Debug("bfsp:config/npmginore");
export const watchNpmIgnore = (
  projectDirpath: string,
  bfspUserConfigStream: SharedAsyncIterable<$BfspUserConfig>,
  options: {
    write?: boolean;
    npmIgnoreInitPo?: BFChainUtil.PromiseMaybe<$NpmIgnore>;
  } = {}
) => {
  const follower = new SharedFollower<$NpmIgnore>();
  const { write = false } = options;

  let curNpmIgnore: $NpmIgnore | undefined;
  const looper = Loopable("watch #bfsp.npmignore", async () => {
    if (curNpmIgnore === undefined && options.npmIgnoreInitPo !== undefined) {
      curNpmIgnore = await options.npmIgnoreInitPo;
      follower.push(curNpmIgnore);
    }

    const bfspUserConfig = await bfspUserConfigStream.getCurrent();
    const newNpmIgnore = await generateNpmIgnore(projectDirpath, bfspUserConfig.userConfig);
    if (isEqualSet(newNpmIgnore, curNpmIgnore)) {
      return;
    }
    if (write) {
      await writeNpmIgnore(projectDirpath, newNpmIgnore);
    }
    log("npmignore changed");
    follower.push((curNpmIgnore = newNpmIgnore));
  });

  //#region 监听变更
  bfspUserConfigStream.onNext(looper.loop);
  //#endregion

  looper.loop();
  return new SharedAsyncIterable<$NpmIgnore>(follower);
};
