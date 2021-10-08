/// test
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { getBfspConfig } from "../src/toolkit";
// if(import.meta.)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
(async () => {
  //   console.log("demoUrl", demoUrl);
  console.log("GG", await getBfspConfig(resolve(__dirname, "../../demo")));
})();
