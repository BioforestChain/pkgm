import cp from "node:child_process";

export const doInit = async (options: { root: string }) => {
  const { root } = options;

  console.log("linking dependencies");

  return new Promise((resolve) => {
    const proc = cp.exec("corepack yarn", { cwd: root });
    proc.stdout?.pipe(process.stdout);
    proc.stderr?.pipe(process.stderr);

    proc.on("exit", (e) => {
      resolve(true);
    });
  });
};
