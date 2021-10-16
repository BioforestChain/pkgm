declare interface AsyncGenerator<T> {
  map<R>(map: (i: T) => R): AsyncGenerator<BFChainUtil.PromiseType<R>>;
  filter<R = T>(
    filter: (i: T) => BFChainUtil.PromiseMaybe<boolean>
  ): AsyncGenerator<R>;
  toArray(): Promise<T[]>;
  toSharable(): import("../src/toolkit").SharedAsyncIterable<T>;
}
