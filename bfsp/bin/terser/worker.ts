import { minify } from "terser";
import { isMainThread, parentPort } from "node:worker_threads";
import { readFile, writeFile } from "node:fs/promises";

if (!isMainThread) {
  parentPort!.on("message", async (v: { paths: string[] }) => {
    const { paths } = v;
    const tasks = paths.map((p) => {
      return new Promise(async (resolve) => {
        const ret = { path: p, success: true };
        try {
          const source = await readFile(p);
          const output = await minify(source.toString());
          if (output.code !== undefined) {
            await writeFile(p, output.code);
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
