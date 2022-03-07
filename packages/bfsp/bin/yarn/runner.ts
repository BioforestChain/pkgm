import cp from "node:child_process";
export interface RunYarnOption {
  root: string;
  onExit?: () => void;
  onMessage?: (s: string) => void;
}
export const runYarn = (opts: RunYarnOption) => {
  const proc = cp.exec(`corepack yarn`, { cwd: opts.root });
  const ret = {
    stop() {
      proc.kill();
    },
  };

  proc.stdout?.on("data", (data: string) => opts.onMessage?.(data));
  proc.stderr?.on("data", (data: string) => opts.onMessage?.(data));
  proc.on("exit", (e) => {
    opts.onExit?.();
  });

  return ret;
};
