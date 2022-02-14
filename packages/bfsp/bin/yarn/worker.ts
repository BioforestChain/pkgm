import { isMainThread, parentPort } from "node:worker_threads";
import cp from "node:child_process";

if (!isMainThread) {
  parentPort!.on("message", async (v: { path: string }) => {
    const proc = cp.exec(`corepack yarn`, { cwd: v.path });
    proc.stdout?.on("data", (data: string) => parentPort?.postMessage({ msg: data }));
    proc.stderr?.on("data", (data: string) => parentPort?.postMessage({ msg: data }));

    proc.on("exit", (e) => {
      parentPort!.postMessage({ exited: e });
    });
  });
}
