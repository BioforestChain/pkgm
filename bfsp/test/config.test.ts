import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  generateTsconfig,
  getBfspUserConfig,
  gitignoreListCache,
} from "../src/";
import test from "ava";
// import {  } from 'jest'
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkgmProjectPath = resolve(__dirname, "../../");
const demoProjectPath = resolve(pkgmProjectPath, "demo");

test("get  config in 'demo' project", async (t) => {
  const config = await getBfspUserConfig(demoProjectPath);
  t.truthy(config);
  const tsconfig = await generateTsconfig(demoProjectPath, config);

  console.log(tsconfig.files);
});

test("get gitignore rules", async (t) => {
  const rules = await gitignoreListCache.get(__dirname);
  t.log(pkgmProjectPath);
  t.deepEqual(rules, [
    { basedir: pkgmProjectPath, rules: ["node_modules", "dist"] },
  ]);
});
