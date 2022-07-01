import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gitignoreListCache } from "../sdk/toolkit/toolkit.fs.mjs";
import { defineTest } from "../test.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkgmProjectPath = resolve(__dirname, "../../");
const demoProjectPath = resolve(pkgmProjectPath, "demo");

// test("get config in 'demo' project", async (t) => {
//   const config = await getBfspProjectConfig(demoProjectPath);
//   t.truthy(config);

//   const subConfigs = await writeBfspProjectConfig(config!);
//   watchBfspProjectConfig(config!, { tsConfig: subConfigs.tsConfig });

//   const timeout = sleep(2000);

//   const randomFilename = `test-${Math.random().toString(36)}.type`;
//   const randomFilepath = resolve(demoProjectPath, "bin/" + randomFilename + ".ts");
//   const typesFilepath = resolve(demoProjectPath, "typings/@types.d.ts");

//   writeFileSync(randomFilepath, "// test");
//   await sleep(500);
//   t.true(readFileSync(typesFilepath, "utf-8").includes(randomFilename), "should be inserted");

//   await sleep(1000);

//   unlinkSync(randomFilepath);
//   await sleep(500);
//   t.true(
//     existsSync(typesFilepath) === false || readFileSync(typesFilepath, "utf-8").includes(randomFilename) === false,
//     "should be removed"
//   );

//   await timeout;
// });

defineTest("get gitignore rules", async (t) => {
  const rules = await gitignoreListCache.get(__dirname);
  t.log(pkgmProjectPath);
  t.deepEqual(rules, [{ basedir: pkgmProjectPath, rules: ["node_modules", "dist"] }]);
});
