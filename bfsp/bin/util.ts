import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fileIO } from "../src";
import { require } from "../src/toolkit";

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
  // private _containsFn: (set:Set<T>, b: T) => boolean;
  constructor(
    opts: {
      /**节点比较器，>0父亲，<0孩子，0兄弟 */
      compareFn: (a: T, b: T) => number;
      /**判断节点`b`是否应该是`a`的子节点 */
      childFn: (a: T, b: T) => boolean;
      /**判断两个节点是否相等 */
      eqFn: (a: T, b: T) => boolean;
    },
    rootData?: T
  ) {
    this._childFn = opts.childFn;
    this._compareFn = opts.compareFn;
    this._eqFn = opts.eqFn;
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
    const queue = [] as TreeNode<T>[];
    const visited = [] as TreeNode<T>[];
    const visit = async (n: TreeNode<T>) => {
      if (visited.some((x) => this._eqFn(x.data, n.data))) {
        return;
      }
      await cb(n);
      visited.push(n);
      if (n.children) {
        queue.push(...n.children);
      }
      const x = queue.shift();
      x && (await visit(x));
    };
    await visit(r);
  }
  walk(r: TreeNode<T>) {
    const queue = [] as TreeNode<T>[];
    const visited = [] as TreeNode<T>[];
    const tree = this;
    function* walk(n: TreeNode<T>): Generator<TreeNode<T>> {
      if (visited.some((x) => tree._eqFn(x.data, n.data))) {
        return;
      }
      yield n;
      visited.push(n);
      if (n.children) {
        queue.push(...n.children);
      }
      const x = queue.shift();
      x && (yield* walk(x));
    }

    return walk(r);
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

export const getYarnPath = () => {
  const importer = import.meta.url;
  const idx = importer.lastIndexOf("@bfchain/pkgm");
  if (idx >= 0) {
    // 全局安装
    const baseNodeModulesDir = fileURLToPath(importer.substring(0, idx));
    let yarnPath = path.join(baseNodeModulesDir, "yarn/bin/yarn.js"); // yarn global
    if (!existsSync(yarnPath)) {
      // npm i -g
      yarnPath = path.join(baseNodeModulesDir, "@bfchain/pkgm/node_modules/yarn/bin/yarn.js");
    }
    return yarnPath;
  } else {
    // 本地调试
    const lidx = importer.lastIndexOf("/dist/");
    const baseDir = fileURLToPath(importer.substring(0, lidx));
    let yarnPath = path.join(baseDir, "node_modules/yarn/bin/yarn.js");
    return yarnPath;
  }
};

export const getPkgmVersion = () => {
  const importer = import.meta.url;
  const idx = importer.lastIndexOf("@bfchain/pkgm");
  let p = "";
  if (idx >= 0) {
    // 全局安装
    const baseNodeModulesDir = fileURLToPath(importer.substring(0, idx));
    p = path.join(baseNodeModulesDir, "@bfchain/pkgm/package.json"); // yarn global
    if (!existsSync(p)) {
      // npm i -g
      p = path.join(baseNodeModulesDir, "package.json");
    }
  } else {
    // 本地调试
    const lidx = importer.lastIndexOf("/dist/");
    const bfspDir = fileURLToPath(importer.substring(0, lidx));
    p = path.join(bfspDir, "package.json");
  }
  const packageJson = require(p);
  return packageJson.version;
};

export class Tasks<T> {
  private _set = new Set<T>();
  private _queue = [] as T[];
  add(item: T) {
    this._set.add(item);
  }
  next() {
    let item = this._queue.shift();
    if (!item) {
      this._queue = [...this._set.values()];
      item = this._queue.shift();
    }
    item && this._set.delete(item);
    return item;
  }
}
