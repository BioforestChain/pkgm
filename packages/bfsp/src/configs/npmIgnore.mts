import { resolve } from "node:path";
import { DevLogger } from "../../sdk/logger/logger.mjs";
import { SharedAsyncIterable, SharedFollower, Loopable } from "../../sdk/toolkit/toolkit.stream.mjs";
import { fileIO } from "../../sdk/toolkit/toolkit.fs.mjs";
import { isEqualSet } from "../../sdk/toolkit/toolkit.lang.mjs";
import { $BfspUserConfig } from "./bfspUserConfig.mjs";
import { defaultIgnores, effectConfigIgnores } from "./commonIgnore.mjs";

export const defaultNpmIgnores = new Set(defaultIgnores);
for (const item of ["tests", "dist", "build"]) {
  defaultNpmIgnores.add(item);
}

export const generateNpmIgnore = async (projectDirpath: string, config: Bfsp.UserConfig) => {
  return effectConfigIgnores(defaultNpmIgnores, config.npmignore);
};

export type $NpmIgnore = Awaited<ReturnType<typeof generateNpmIgnore>>;

export const writeNpmIgnore = (projectDirpath: string, npmIgnore: $NpmIgnore) => {
  return fileIO.set(resolve(projectDirpath, ".npmignore"), Buffer.from([...npmIgnore].join("\n")));
};
const debug = DevLogger("bfsp:config/npmginore");
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

    const bfspUserConfig = await bfspUserConfigStream.waitCurrent();
    const newNpmIgnore = await generateNpmIgnore(projectDirpath, bfspUserConfig.userConfig);
    if (isEqualSet(newNpmIgnore, curNpmIgnore)) {
      return;
    }
    if (write) {
      await writeNpmIgnore(projectDirpath, newNpmIgnore);
    }
    debug("npmignore changed");
    follower.push((curNpmIgnore = newNpmIgnore));
  });

  //#region 监听变更
  bfspUserConfigStream.onNext(looper.loop);
  //#endregion

  looper.loop();
  return new SharedAsyncIterable<$NpmIgnore>(follower);
};
