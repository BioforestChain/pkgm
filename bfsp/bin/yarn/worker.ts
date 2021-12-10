import { minify } from "terser";
import { isMainThread, parentPort } from "node:worker_threads";
import { readFileSync, writeFileSync } from "node:fs";
import cp from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";

if (!isMainThread) {
  parentPort!.on("message", async (v: { path: string }) => {
    const yarnPath = path.join(fileURLToPath(import.meta.url), "../../node_modules/yarn/bin/yarn.js");
    const proc = cp.exec(`node ${yarnPath}`, { cwd: v.path });
    // console.log(yarnPath, v.path);
    // @TODO: yarn的输出代理到面板显示
    // proc.stdout?.on("data", (data) => process.stdout.write(data));
    // proc.stderr?.on("data", (data) => process.stderr.write(data));

    proc.on("exit", (e) => {
      parentPort!.postMessage({ exited: e });
    });
  });
}
