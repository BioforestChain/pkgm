import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import {
  getBfspProjectConfig,
  writeBfspProjectConfig,
  gitignoreListCache,
} from "../src";
import test from "ava";
import { sleep } from "@bfchain/util-extends-promise";
// import {  } from 'jest'
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkgmProjectPath = resolve(__dirname, "../../");
const demoProjectPath = resolve(pkgmProjectPath, "demo");

test("get config in 'demo' project", async (t) => {
  const config = await getBfspProjectConfig(demoProjectPath);
  t.truthy(config);

  // console.log(config);
  await writeBfspProjectConfig(config!, { watch: true });
  const timeout = sleep(2000);

  const randomFilename = `test-${Math.random().toString(36)}.type.ts`;
  const randomFilepath = resolve(demoProjectPath, "bin/" + randomFilename);
  const typesFilepath = resolve(demoProjectPath, "typings/@types.d.ts");

  writeFileSync(randomFilepath, "// test");
  await sleep(500);
  t.true(
    readFileSync(typesFilepath, "utf-8").includes(randomFilename),
    "should be inserted"
  );

  await sleep(1000);

  unlinkSync(randomFilepath);
  await sleep(500);
  t.true(
    existsSync(typesFilepath) === false ||
      readFileSync(typesFilepath, "utf-8").includes(randomFilename) === false,
    "should be removed"
  );

  await timeout;
});

test("get gitignore rules", async (t) => {
  const rules = await gitignoreListCache.get(__dirname);
  t.log(pkgmProjectPath);
  t.deepEqual(rules, [
    { basedir: pkgmProjectPath, rules: ["node_modules", "dist"] },
  ]);
});
