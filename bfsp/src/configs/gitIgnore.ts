import { resolve } from "node:path";
import { Debug } from "../logger";
import { fileIO, isEqualSet, Loopable, SharedAsyncIterable, SharedFollower } from "../toolkit";
import { $BfspUserConfig } from "./bfspUserConfig";
import { effectConfigIgnores } from "./commonIgnore";

export const defaultGitIgnores = new Set([
  ".npm",
  ".vscode",
  ".bfsp",
  "node_modules",
  "dist",
  ".gitignore",
  "*.tsbuildinfo",
  ".npmignore",
  ".*.ts",
  "typings/dist",
  "typings/dist.d.ts",
  "package.json",
  "tsconfig.isolated.json",
  "tsconfig.typings.json",
  "tsconfig.json",
]);

export const generateGitIgnore = async (projectDirpath: string, config: Bfsp.UserConfig) => {
  return effectConfigIgnores(defaultGitIgnores, config?.gitignore);
};

export type $GitIgnore = BFChainUtil.PromiseReturnType<typeof generateGitIgnore>;

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
