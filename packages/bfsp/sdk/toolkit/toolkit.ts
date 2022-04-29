import "@bfchain/pkgm-base/util/typings";
import path from "node:path";
import { PromiseOut } from "@bfchain/pkgm-base/util/extends_promise_out";

import { toPosixPath } from "./toolkit.path";

//#region 模糊Array与Set的辅助集合
export abstract class List<T> implements Iterable<T> {
  abstract [Symbol.iterator](): Iterator<T, any, undefined>;
  abstract add(item: T): void;
  abstract remove(item: T): void;
  abstract toArray(): T[];
  abstract toSet(): Set<T>;
  abstract get size(): number;
}
export class ListArray<T> extends List<T> {
  constructor(items?: Iterable<T>) {
    super();
    if (items !== undefined) {
      if (Array.isArray(items)) {
        this._arr = items;
      } else {
        this._arr = [...items];
      }
    } else {
      this._arr = [];
    }
  }
  private _arr: T[];
  add(item: T): void {
    if (this._arr.includes(item) === false) {
      this._arr[this._arr.length] = item;
    }
  }
  remove(item: T): void {
    const index = this._arr.indexOf(item);
    if (index !== -1) {
      this._arr.splice(index, 1);
    }
  }
  get size() {
    return this._arr.length;
  }
  [Symbol.iterator]() {
    return this._arr[Symbol.iterator]();
  }
  toArray() {
    return this._arr;
  }
  toSet() {
    return new Set(this._arr);
  }
}
export class ListSet<T> extends List<T> {
  constructor(items?: Iterable<T>) {
    super();
    this._set = new Set(items);
  }
  private _set: Set<T>;
  add(item: T): void {
    this._set.add(item);
  }
  remove(item: T): void {
    this._set.delete(item);
  }
  get size() {
    return this._set.size;
  }
  [Symbol.iterator]() {
    return this._set[Symbol.iterator]();
  }
  toArray() {
    return [...this._set];
  }
  toSet() {
    return this._set;
  }
}
//#endregion

/**为出口的js文件进行自动重命名,寻找一个不冲突的文件名
 * input 与 output 一一对应
 * 但是input可以有别名,这些别名决定着output
 * 别名可以一样
 *
 * input: InputPath
 * output: OutputName
 */
export class ExportsMap {
  readonly oi = new Map<string, string>();
  readonly io = new Map<string, string>();
  hasInput(input: string) {
    return this.io.has(input);
  }
  defineOutput(input: string, output: string) {
    this.oi.set(output, input);
    this.io.set(input, output);
  }
  autoOutput(input: string, inputAlias: string) {
    let output = this.io.get(input);
    if (output !== undefined) {
      return output;
    }
    let autoNameAcc = 0;
    do {
      output = autoNameAcc === 0 ? inputAlias : `${inputAlias}-${autoNameAcc}`;
      if (this.oi.has(output) === false) {
        break;
      }

      autoNameAcc += Math.ceil(this.oi.size / 2);
    } while (true);

    this.defineOutput(input, output);
    return output;
  }
  getOutput(input: string) {
    return this.io.get(input);
  }
  delInput(input: string) {
    const output = this.io.get(input);
    if (output !== undefined) {
      this.io.delete(input);
      this.oi.delete(output);
      return true;
    }
    return false;
  }
}

export const parseExports = (exports: Bfsp.UserConfig["exports"]) => {
  const exportsMap = new ExportsMap();
  let _index: { posixKey: string; input: string; key: string } | undefined;
  const standardExports: Bfsp.UserConfig["exports"] = { ".": "" };
  /// 先暴露出模块
  for (const key in exports) {
    /**一个格式化后的key, 是用于提供 @bfchain/xxx/{key} 这样的扩展包的 */
    const posixKey = path.posix.normalize(key);
    if (posixKey.startsWith("..")) {
      console.error(`invalid exports key: '${key}'`);
      continue;
    }
    const input: string = toPosixPath((exports as any)[key]);

    let inputAlias = posixKey;
    if (posixKey === "." || posixKey === "./" || posixKey === "") {
      standardExports["."] = input;

      inputAlias = "index";
      if (_index !== undefined) {
        console.error(`duplicated default export: '${posixKey}', will use '.' by default`);
        if (_index.posixKey === ".") {
          continue;
        }
        exportsMap.delInput(_index.input);
      }
      _index = { posixKey, input, key };
    } else {
      if (posixKey in standardExports) {
        console.error(`duplicated default export: '${posixKey}('${key}')'`);
        continue;
      }
      (standardExports as any)[posixKey] = input;
    }

    exportsMap.autoOutput(input, inputAlias);
  }

  if (_index === undefined) {
    throw new Error("no found default export('.')");
  }

  return {
    exportsMap,
    formatedExports: standardExports,
    indexFile: _index.input,
    indexKey: {
      sourceKey: _index.key,
      posixKey: _index.posixKey,
    },
  };
};

export interface TreeNode<T> {
  data: T;
  parent?: TreeNode<T>;
  children?: TreeNode<T>[];
}
export class Tree<T> {
  private _root?: TreeNode<T>;
  private _compareFn: (a: T, b: T) => number;
  private _childFn: (a: T, b: T) => boolean;
  private _eqFn: (a: T, b: T) => boolean;
  private _containsFn: (set: Set<T>, b: T) => boolean;
  constructor(
    opts: {
      /**节点比较器，>0父亲，<0孩子，0兄弟 */
      compareFn: (a: T, b: T) => number;
      /**判断节点`b`是否应该是`a`的子节点 */
      childFn: (a: T, b: T) => boolean;
      /**判断两个节点是否相等 */
      eqFn: (a: T, b: T) => boolean;
      /**判断指定节点是否存在于某一个集合中 */
      containsFn?: (set: Set<T>, a: T) => boolean;
    },
    rootData?: T
  ) {
    this._childFn = opts.childFn;
    this._compareFn = opts.compareFn;
    this._eqFn = opts.eqFn;
    this._containsFn =
      opts.containsFn ||
      ((set, b) => {
        for (const item of set) {
          if (this._eqFn(item, b)) {
            return true;
          }
        }
        return false;
      });
    if (rootData) {
      this.addOrUpdate(rootData);
    }
  }
  getRoot() {
    if (!this._root) return undefined;
    let r = this._root;
    while (r.parent) {
      r = r.parent;
    }
    this._root = r;
    return r;
  }
  async forEach(r: TreeNode<T>, cb: (n: TreeNode<T>) => BFChainUtil.PromiseMaybe<void>) {
    for (const node of this.walk(r)) {
      await cb(node);
    }
  }
  *walk(r: TreeNode<T>) {
    const visitedNodes = new Set<TreeNode<T>>();
    visitedNodes.add(r);
    for (const node of visitedNodes) {
      yield node;
      if (node.children) {
        for (const child of node.children) {
          visitedNodes.add(child);
        }
      }
    }
  }
  addOrUpdate(d: T) {
    if (!this._root) {
      this._root = { data: d };
    }
    return this._addOrUpdateInner(this._root!, d);
  }

  private _addOrUpdateInner(n: TreeNode<T>, d: T): TreeNode<T> {
    const res = this._compareFn(n.data, d);
    if (res === 0) {
      n.data = d;
      return n;
    } else if (res > 0) {
      if (n.parent) {
        return this._addOrUpdateInner(n.parent, d);
      } else {
        // 成为了新的root
        const newRoot = { data: d } as TreeNode<T>;
        n.parent = newRoot;
        newRoot.children = [n];
        return newRoot;
      }
    } else {
      if (!n.children) {
        n.children = [];
      }

      // 找出目标节点应该挂在哪个子节点下
      const t = n.children.find((x) => this._childFn(d, x.data));
      if (!t) {
        // 如果找不到，就挂在n下面，并且更新n原有节点的归属关系
        const nn = { data: d, parent: n } as TreeNode<T>;
        const tempChildren = n.children;
        n.children = [];

        tempChildren.forEach((x) => {
          if (this._childFn(x.data, nn.data)) {
            x.parent = nn;
            if (!nn.children) {
              nn.children = [x];
            } else {
              nn.children.push(x);
            }
          } else {
            n.children!.push(x);
          }
        });
        n.children.push(nn);
        return nn;
      } else {
        return this._addOrUpdateInner(t, d);
      }
    }
  }
  del(d: T) {
    const r = this.getRoot();
    if (!r) {
      return undefined;
    }
    return this._delInner(r, d);
  }
  private _delInner(n: TreeNode<T>, d: T): TreeNode<T> | undefined {
    if (this._eqFn(n.data, d)) {
      if (!n.parent) {
        // root deleted
        return n;
      }
      const idx = n.parent.children?.findIndex((x) => this._eqFn(x.data, n.data));
      n.parent.children?.splice(idx!, 1);
      n.children?.forEach((x) => (x.parent = n.parent));
      return n;
    } else {
      if (n.children) {
        for (const c of n.children) {
          return this._delInner(c, d);
        }
      }
    }
  }
}

type OrderMap<T> = Map<T, { has: boolean }>;
export class Tasks<T extends string> {
  private _order: OrderMap<T> = new Map(); // [] as T[];
  hasRemaining() {
    for (const info of this._order.values()) {
      if (info.has) {
        return true;
      }
    }
    return false;
  }
  useOrder(arr: T[]) {
    const newOrder: OrderMap<T> = new Map();
    const oldOrder = this._order;
    for (const item of arr) {
      newOrder.set(item, oldOrder.get(item) ?? { has: false });
    }
    this._order = newOrder;
  }
  add(item: T) {
    const info = this._order.get(item);
    if (info) {
      const waitter = this._waitters.shift();
      if (waitter !== undefined) {
        waitter.resolve(item);
      } else {
        info.has = true;
      }
    }
  }
  getOrder() {
    return this._order.keys();
  }

  private _waitters: PromiseOut<T>[] = [];
  async next() {
    for (const [item, info] of this._order) {
      if (info.has) {
        info.has = false;
        return item;
      }
    }

    const waitter = new PromiseOut<T>();
    this._waitters.push(waitter);
    return waitter.promise;
  }
}
