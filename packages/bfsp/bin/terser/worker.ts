import { minify } from "terser";
import { isMainThread, parentPort } from "node:worker_threads";
import { readFileSync, writeFileSync } from "node:fs";

if (!isMainThread) {
  parentPort!.on("message", async (v: { paths: string[] }) => {
    const { paths } = v;
    const tasks = paths.map((p) => {
      return new Promise<{ path: string; success: boolean }>(async (resolve) => {
        const ret = { path: p, success: true };
        try {
          const output = await minify(readFileSync(p, "utf-8"));
          if (output.code !== undefined) {
            await writeFileSync(p, output.code);
          } else {
            ret.success = false;
          }
        } catch (e) {
          ret.success = false;
        }
        resolve(ret);
      });
    });
    const results = await Promise.all(tasks);
    parentPort!.postMessage({ results });
  });
}
