import { spawn } from "node:child_process";
let isBaseSuccess = false;
function exec(cwd) {
  const theCp = spawn("yarn", ["dev"], { cwd, shell: true });
  theCp.stdout.pipe(process.stdout);
  theCp.stderr.pipe(process.stderr);
  return theCp;
}
async function run() {
  // 先执行base的编译
  const theCp = exec("./packages/base");
  for await (const data of theCp.stdout) {
    const str = String(data);
    if (!isBaseSuccess) {
      if (/built in \d+ms/.test(str)) {
        isBaseSuccess = true;
        // 成功之后再执行bfsp和bfsw的编译
        exec("./packages/bfsp");
        exec("./packages/bfsw");
      }
    }
  }
}
run();
