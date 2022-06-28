declare interface AsyncGenerator<T> {
  map<R>(map: (i: T) => R): AsyncGenerator<BFChainUtil.PromiseType<R>>;
  filter<R = T>(filter: (i: T) => BFChainUtil.PromiseMaybe<boolean>): AsyncGenerator<R>;
  toArray(): Promise<T[]>;
  toSharable(): import("../src/sdk/toolkit/toolkit.stream.mjs").SharedAsyncIterable<T>;
}

declare interface IExclusive {
  [key:string]:string| string[],
  web:string| string[],
  node:string| string[],
  prod:string| string[],
  dev:string| string[],
}