declare namespace Bfsp {
  type WatcherAction = "add" | "change" | "unlink";
  interface AppWatcher {
    watchTs(root: string, cb: WatcherHanlder): BFChainUtil.PromiseMaybe<void>;
    watchUserConfig(root: string, cb: WatcherHanlder): BFChainUtil.PromiseMaybe<void>;
  }
  type WatcherHanlder = (p: string, type: WatcherAction) => void;
}
