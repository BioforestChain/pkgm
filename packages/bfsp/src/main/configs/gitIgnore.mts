import { resolve } from "node:path";
import { DevLogger } from "../../sdk/logger/logger.mjs";
import { fileIO } from "@bfchain/pkgm-base/toolkit/toolkit.fs.mjs";
import { isEqualSet } from "@bfchain/pkgm-base/toolkit/toolkit.lang.mjs";
import { SharedAsyncIterable, SharedFollower, Loopable } from "@bfchain/pkgm-base/toolkit/toolkit.stream.mjs";
import { $BfspEnvConfig } from "../bfspConfig.mjs";
import { $BfspUserConfig } from "./bfspUserConfig.mjs";
import { defaultIgnores, effectConfigIgnores } from "./commonIgnore.mjs";

export const defaultGitIgnores = new Set(defaultIgnores);
for (const item of ["package.json", "dist", "build"]) {
  defaultGitIgnores.add(item);
}

export const generateGitIgnore = async (env: $BfspEnvConfig, config: Bfsp.UserConfig) => {
  return effectConfigIgnores(defaultGitIgnores, config?.gitignore);
};

export type $GitIgnore = Awaited<ReturnType<typeof generateGitIgnore>>;

export const writeGitIgnore = (bfspEnvConfig: $BfspEnvConfig, gitIgnore: $GitIgnore) => {
  const { projectDirpath } = bfspEnvConfig;
  return fileIO.set(resolve(projectDirpath, ".gitignore"), Buffer.from([...gitIgnore].join("\n")));
};

const debug = DevLogger("bfsp:config/gitginore");
export const watchGitIgnore = (
  bfspEnvConfig: $BfspEnvConfig,
  bfspUserConfigStream: SharedAsyncIterable<$BfspUserConfig>,
  options: {
    write?: boolean;
    gitIgnoreInitPo?: BFChainUtil.PromiseMaybe<$GitIgnore>;
  } = {}
) => {
  const { projectDirpath } = bfspEnvConfig;
  const follower = new SharedFollower<$GitIgnore>();
  const { write = false } = options;

  let curGitIgnore: $GitIgnore | undefined;
  const looper = Loopable("watch #bfsp.gitignore", async () => {
    if (curGitIgnore === undefined && options.gitIgnoreInitPo !== undefined) {
      curGitIgnore = await options.gitIgnoreInitPo;
      follower.push(curGitIgnore);
    }

    const bfspUserConfig = await bfspUserConfigStream.waitCurrent();
    const newGitIgnore = await generateGitIgnore(bfspEnvConfig, bfspUserConfig.userConfig);
    if (isEqualSet(newGitIgnore, curGitIgnore)) {
      return;
    }
    if (write) {
      await writeGitIgnore(bfspEnvConfig, newGitIgnore);
    }
    debug("gitignore changed");
    follower.push((curGitIgnore = newGitIgnore));
  });

  //#region 监听变更
  bfspUserConfigStream.onNext(looper.loop);
  //#endregion

  looper.loop();
  return new SharedAsyncIterable<$GitIgnore>(follower);
};
