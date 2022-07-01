import { resolve } from "node:path";
import { DevLogger } from "../../sdk/logger/logger.mjs";
import { SharedAsyncIterable, SharedFollower, Loopable } from "@bfchain/pkgm-base/toolkit/toolkit.stream.mjs";
import { fileIO } from "@bfchain/pkgm-base/toolkit/toolkit.fs.mjs";
import { isEqualSet } from "@bfchain/pkgm-base/toolkit/toolkit.lang.mjs";
import { $BfspUserConfig } from "./bfspUserConfig.mjs";
import { defaultIgnores, effectConfigIgnores } from "./commonIgnore.mjs";
import { $BfspEnvConfig } from "../bfspConfig.mjs";

export const defaultNpmIgnores = new Set(defaultIgnores);
for (const item of ["tests", "dist", "build"]) {
  defaultNpmIgnores.add(item);
}

export const generateNpmIgnore = async (env: $BfspEnvConfig, config: Bfsp.UserConfig) => {
  return effectConfigIgnores(defaultNpmIgnores, config.npmignore);
};

export type $NpmIgnore = Awaited<ReturnType<typeof generateNpmIgnore>>;

export const writeNpmIgnore = (bfspEnvConfig: $BfspEnvConfig, npmIgnore: $NpmIgnore) => {
  const { projectDirpath } = bfspEnvConfig;
  return fileIO.set(resolve(projectDirpath, ".npmignore"), Buffer.from([...npmIgnore].join("\n")));
};
const debug = DevLogger("bfsp:config/npmginore");
export const watchNpmIgnore = (
  bfspEnvConfig: $BfspEnvConfig,
  bfspUserConfigStream: SharedAsyncIterable<$BfspUserConfig>,
  options: {
    write?: boolean;
    npmIgnoreInitPo?: BFChainUtil.PromiseMaybe<$NpmIgnore>;
  } = {}
) => {
  const { projectDirpath } = bfspEnvConfig;
  const follower = new SharedFollower<$NpmIgnore>();
  const { write = false } = options;

  let curNpmIgnore: $NpmIgnore | undefined;
  const looper = Loopable("watch #bfsp.npmignore", async () => {
    if (curNpmIgnore === undefined && options.npmIgnoreInitPo !== undefined) {
      curNpmIgnore = await options.npmIgnoreInitPo;
      follower.push(curNpmIgnore);
    }

    const bfspUserConfig = await bfspUserConfigStream.waitCurrent();
    const newNpmIgnore = await generateNpmIgnore(bfspEnvConfig, bfspUserConfig.userConfig);
    if (isEqualSet(newNpmIgnore, curNpmIgnore)) {
      return;
    }
    if (write) {
      await writeNpmIgnore(bfspEnvConfig, newNpmIgnore);
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
