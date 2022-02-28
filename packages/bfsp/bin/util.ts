import { existsSync, readdirSync, statSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fileIO } from "../src";
import { require } from "../src/toolkit.require";

export function rearrange<T>(numContainer: number, items: T[], cb: (items: T[]) => void) {
  if (items.length < numContainer) {
    items.forEach((x) => cb([x]));
    return;
  }
  const avg = Math.floor(items.length / numContainer);
  const mod = items.length % numContainer;
  for (let i = 0; i < numContainer; i++) {
    const start = i * avg;
    const slicedItems = items.slice(start, start + avg);
    if (mod > 0 && i < mod) {
      slicedItems.push(items[items.length - mod + i]);
    }
    cb(slicedItems);
  }
}

export async function writeJsonConfig(path: string, config: any) {
  await fileIO.set(path, Buffer.from(JSON.stringify(config, null, 2)));
}
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

export const getBfspDir = () => {
  const importer = import.meta.url;
  const idx = importer.lastIndexOf("@bfchain/pkgm-bfsp");
  let p = "";
  if (idx >= 0) {
    // 全局安装
    const baseNodeModulesDir = fileURLToPath(importer.substring(0, idx));
    p = path.join(baseNodeModulesDir, "@bfchain/pkgm-bfsp"); // yarn global
    if (!existsSync(p)) {
      // npm i -g
      p = baseNodeModulesDir;
    }
  } else {
    // 本地调试
    const lidx = importer.lastIndexOf("/dist/");
    const bfspDir = fileURLToPath(importer.substring(0, lidx));
    p = bfspDir;
  }
  return p;
};

export const getBfswDir = () => {
  const importer = import.meta.url;
  const idx = importer.lastIndexOf("@bfchain/pkgm-bfsw");
  let p = "";
  if (idx >= 0) {
    // 全局安装
    const baseNodeModulesDir = fileURLToPath(importer.substring(0, idx));
    p = path.join(baseNodeModulesDir, "@bfchain/pkgm-bfsw"); // yarn global
    if (!existsSync(p)) {
      // npm i -g
      p = baseNodeModulesDir;
    }
  } else {
    // 本地调试
    const lidx = importer.lastIndexOf("/dist/");
    const bfspDir = fileURLToPath(importer.substring(0, lidx));
    p = bfspDir;
  }
  p = p.replace("bfsp", "bfsw");

  return p;
};
export const getBfspWorkerDir = () => {
  return path.join(getBfspDir(), "dist");
};
export const getBfspPackageJson = () => {
  const p = path.join(getBfspDir(), "package.json");
  return new Function(`return ${readFileSync(p, "utf-8")}`)();
};
export const getBfspVersion = () => {
  return getBfspPackageJson().version;
};

export const getBfswPackageJson = () => {
  const p = path.join(getBfswDir(), "package.json");
  return new Function(`return ${readFileSync(p, "utf-8")}`)();
};
export const getBfswVersion = () => {
  return getBfswPackageJson().version;
};

export class Tasks<T extends string> {
  private _set = new Set<T>();
  private _queue = [] as T[];
  private _order = [] as T[];
  remaining() {
    return this._set.size;
  }
  useOrder(arr: T[]) {
    this._order = arr;
  }
  add(item: T) {
    this._set.add(item);
  }
  next() {
    let item = this._queue.shift();
    if (!item) {
      this._queue = [...this._set.values()];
      this._queue.sort((a, b) => {
        const aidx = this._order.findIndex((x) => x === a);
        const bidx = this._order.findIndex((x) => x === b);
        return aidx - bidx;
      });
      item = this._queue.shift();
    }
    item && this._set.delete(item);
    return item;
  }
}
