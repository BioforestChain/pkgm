import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { getBfspUserConfig } from "../src/toolkit";
import test from "ava";
// import {  } from 'jest'
test("could no get user config in 'demo' project", async (t) => {
  // if(import.meta.)
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  //   console.log("demoUrl", demoUrl);
  const config = await getBfspUserConfig(resolve(__dirname, "../../demo"));
  t.is(config, undefined);
});
