import { defineTest } from "../test.mjs";
import { rearrange } from "../sdk/toolkit/toolkit.util.mjs";

defineTest("rearrange less 1", async (t) => {
  const items2 = [] as number[][];
  rearrange<number>(3, [1, 2], (items) => {
    items2.push(items);
  });
  t.true(items2[0].length === 1);
  t.true(items2[1].length === 1);
  t.true(items2.length === 2);
});
defineTest("rearrange less 2", async (t) => {
  const items2 = [] as number[][];
  rearrange<number>(3, [1], (items) => {
    items2.push(items);
  });
  t.true(items2[0].length === 1);
  t.true(items2.length === 1);
});
defineTest("rearrange just equal", async (t) => {
  const items2 = [] as number[][];
  rearrange<number>(3, [1, 2, 3, 4, 5, 6], (items) => {
    items2.push(items);
  });
  t.true(items2[0].length === 2);
  t.true(items2[1].length === 2);
  t.true(items2[2].length === 2);
});

defineTest("rearrange mod is 1", async (t) => {
  const items2 = [] as number[][];
  rearrange<number>(3, [1, 2, 3, 4, 5, 6, 7], (items) => {
    items2.push(items);
  });
  t.true(items2[0].length === 3);
  t.true(items2[1].length === 2);
  t.true(items2[2].length === 2);
});

defineTest("rearrange mod is 2", async (t) => {
  const items2 = [] as number[][];
  rearrange<number>(3, [1, 2, 3, 4, 5, 6, 7, 8], (items) => {
    items2.push(items);
  });
  t.true(items2[0].length === 3);
  t.true(items2[1].length === 3);
  t.true(items2[2].length === 2);
});
