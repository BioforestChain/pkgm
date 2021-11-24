import test from "ava";
import { Tree } from "../bin/util";

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
