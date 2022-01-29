import { PromiseOut } from "@bfchain/util-extends-promise-out";
import test from "ava";
import { Tasks, Tree } from "../bin/util";
import { Closeable } from "../src";

const compareFn = (a: string, b: string) => {
  if (a === b) {
    return 0;
  }
  if (a.startsWith(b)) {
    return 1;
  } else {
    return -1;
  }
};
const belongsFn = (a: string, b: string) => a.startsWith(b);
test("sort tree", async (t) => {
  const tree = new Tree<string>({ compareFn, childFn: belongsFn, eqFn: (a, b) => a === b }, "/");
  const n = tree.addOrUpdate("/a");

  t.true(n.data === "/a");
});
test("sort tree 1", async (t) => {
  const tree = new Tree<string>({ compareFn, childFn: belongsFn, eqFn: (a, b) => a === b }, "/a");
  const n = tree.addOrUpdate("/");

  t.true(n.data === "/");
});
test("sort tree hole", async (t) => {
  const tree = new Tree<string>({ compareFn, childFn: belongsFn, eqFn: (a, b) => a === b }, "/");
  tree.addOrUpdate("/1");
  tree.addOrUpdate("/2");
  tree.addOrUpdate("/1/3/5");
  const n = tree.addOrUpdate("/1/3");

  t.true(n.data === "/1/3");
  t.true(n.parent && n.parent.data === "/1");
  t.true(n.children && n.children[0].data === "/1/3/5");
  const d = tree.del("/1/3/5");
  t.true(d && d.data === "/1/3/5");
});

test("closable", async (t) => {
  let c = 0;
  const closable = Closeable("x", () => {
    const closeSign = new PromiseOut<boolean>();
    (() => {
      setInterval(() => {
        c++;
      }, 1000);
    })();
    return () => {
      closeSign.resolve(true);
    };
  });
  closable.start();
  const p = new Promise((resolve) => {
    setTimeout(() => {
      closable.close();
      setTimeout(() => {
        resolve(null);
      }, 2000);
    }, 2000);
  });
  await p;
  t.true(c === 2);
});

test("tasks order", async (t) => {
  const tasks = new Tasks<string>();
  tasks.add("1");
  tasks.add("3");
  tasks.add("2");
  tasks.useOrder(["1", "2", "3"]);
  t.true(tasks.next() === "1");
  t.true(tasks.next() === "2");
  t.true(tasks.next() === "3");
});