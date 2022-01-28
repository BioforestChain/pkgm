declare namespace Bfsp {
  type WatcherAction = "add" | "change" | "unlink";
  interface AppWatcher {
    watchTs(root: string, cb: (p: string, type: WatcherAction) => void): BFChainUtil.PromiseMaybe<void>;
    watchUserConfig(root: string, cb: (p: string, type: WatcherAction) => void): BFChainUtil.PromiseMaybe<void>;
  }
}
