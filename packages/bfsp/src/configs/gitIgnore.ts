import { resolve } from "node:path";
import { Debug } from "../logger";
import { fileIO, isEqualSet, Loopable, SharedAsyncIterable, SharedFollower } from "../toolkit";
import { $BfspUserConfig } from "./bfspUserConfig";
import { defaultIgnores, effectConfigIgnores } from "./commonIgnore";

export const defaultGitIgnores = new Set(defaultIgnores);
for (const item of ["package.json", "dist", "build"]) {
  defaultGitIgnores.add(item);
}

export const generateGitIgnore = async (projectDirpath: string, config: Bfsp.UserConfig) => {
  return effectConfigIgnores(defaultGitIgnores, config?.gitignore);
};

export type $GitIgnore = Awaited<ReturnType<typeof generateGitIgnore>>;

export const writeGitIgnore = (projectDirpath: string, gitIgnore: $GitIgnore) => {
  return fileIO.set(resolve(projectDirpath, ".gitignore"), Buffer.from([...gitIgnore].join("\n")));
};

const log = Debug("bfsp:config/gitginore");
export const watchGitIgnore = (
  projectDirpath: string,
  bfspUserConfigStream: SharedAsyncIterable<$BfspUserConfig>,
  options: {
    write?: boolean;
    gitIgnoreInitPo?: BFChainUtil.PromiseMaybe<$GitIgnore>;
  } = {}
) => {
  const follower = new SharedFollower<$GitIgnore>();
  const { write = false } = options;

  let curGitIgnore: $GitIgnore | undefined;
  const looper = Loopable("watch #bfsp.gitignore", async () => {
    if (curGitIgnore === undefined && options.gitIgnoreInitPo !== undefined) {
      curGitIgnore = await options.gitIgnoreInitPo;
      follower.push(curGitIgnore);
    }

    const bfspUserConfig = await bfspUserConfigStream.getCurrent();
    const newGitIgnore = await generateGitIgnore(projectDirpath, bfspUserConfig.userConfig);
    if (isEqualSet(newGitIgnore, curGitIgnore)) {
      return;
    }
    if (write) {
      await writeGitIgnore(projectDirpath, newGitIgnore);
    }
    log("gitignore changed");
    follower.push((curGitIgnore = newGitIgnore));
  });

  //#region 监听变更
  bfspUserConfigStream.onNext(looper.loop);
  //#endregion

  looper.loop();
  return new SharedAsyncIterable<$GitIgnore>(follower);
};
