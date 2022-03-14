import { getYarnPath } from "@bfchain/pkgm-bfsp";
import cp from "node:child_process";
export const doInit = async (options: { root: string }) => {
  const { root } = options;
  console.log("linking dependencies");
  const yarnPath = await getYarnPath();
  return new Promise((resolve) => {
    const proc = cp.spawn("node", [yarnPath], { cwd: root });
    proc.stdout?.pipe(process.stdout);
    proc.stderr?.pipe(process.stderr);

    proc.on("exit", (e) => {
      resolve(true);
    });
  });
};
