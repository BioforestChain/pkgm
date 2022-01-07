import { minify } from "terser";
import { isMainThread, parentPort } from "node:worker_threads";
import { readFileSync, writeFileSync } from "node:fs";
import cp from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import { getYarnPath } from "../util";

if (!isMainThread) {
  parentPort!.on("message", async (v: { path: string }) => {
    const yarnPath = getYarnPath();
    const proc = cp.exec(`node ${yarnPath}`, { cwd: v.path });
    proc.stdout?.on("data", (data: string) => parentPort?.postMessage({ msg: data }));
    proc.stderr?.on("data", (data: string) => parentPort?.postMessage({ msg: data }));

    proc.on("exit", (e) => {
      parentPort!.postMessage({ exited: e });
    });
  });
}
