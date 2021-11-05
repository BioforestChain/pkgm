import os from "node:os";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { walkFiles } from "../../src/toolkit";
import { rearrange } from "../util";

export const runTerser = async (opts: { sourceDir: string; logError: (log: string) => void }) => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  const files = [] as string[];
  for await (const p of walkFiles(opts.sourceDir, { refreshCache: true })) {
    if (/\.[mc]?js[x]?$/.test(p)) {
      files.push(p);
    }
  }
  const workerCount = os.cpus().length - 1;
  const tasks = [] as Promise<{ path: string; success: boolean }[]>[];
  rearrange(workerCount, files, (items) => {
    const task = new Promise<{ path: string; success: boolean }[]>((resolve) => {
      const worker = new Worker(path.join(__dirname, "../terser_worker.mjs"));
      worker.on("message", (v) => {
        if (v.results) {
          worker.terminate();
          resolve(v.results);
        }
      });
      worker.postMessage({ paths: items });
    });
    tasks.push(task);
  });
  const results = (await Promise.all(tasks)).flatMap((v) => v.flatMap((x) => x)).filter((x) => !x.success);
  if (results.length > 0) {
    results.forEach((x) => {
      opts.logError(`minify fail: ${x.path}`);
    });
  }
};
