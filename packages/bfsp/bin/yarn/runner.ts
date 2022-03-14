import cp from "node:child_process";
import { getYarnPath } from "../util";
import {} from "@bfchain/util-extends-promise-out";
export interface RunYarnOption {
  root: string;
  onExit?: () => void;
  onMessage?: (s: string) => void;
}
export const runYarn = (opts: RunYarnOption) => {
  let proc: cp.ChildProcessWithoutNullStreams | undefined;
  let killed = false;
  const ret = {
    stop() {
      killed = true;
      proc?.kill();
    },
  };

  (async () => {
    const yarnPath = await getYarnPath();
    if (killed) {
      return;
    }
    proc = cp.spawn("node", [yarnPath, "install", "--non-interactive"], { cwd: opts.root }); // yarn install --non-interactive

    proc.stdout?.on("data", (data) => opts.onMessage?.(String(data)));
    proc.stderr?.on("data", (data) => opts.onMessage?.(String(data)));
    proc.on("exit", (e) => {
      opts.onExit?.();
    });
  })();

  return ret;
};
