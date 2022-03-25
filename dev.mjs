import { spawn } from "node:child_process";
function exec(cwd, script) {
  const theCp = spawn("yarn", [script], { cwd, shell: true });
  theCp.stdout.pipe(process.stdout);
  theCp.stderr.pipe(process.stderr);
  return theCp;
}

async function* GenerateDevTask(packages) {
  for (const p of packages) {
    const taskName = `${p.dir} : ${p.name}`;
    const cp = exec(p.dir, p.name);
    if (p.wait) {
      let isSuccess = false;
      for await (const data of cp.stdout) {
        const str = String(data);
        if (!isSuccess) {
          if (/built in \d+ms/.test(str)) {
            yield taskName;
            break;
          }
        }
      }
    } else {
      yield taskName;
    }
  }
}

async function run() {
  const packages = ["base", "bfsp", "bfsw"]
    .map((x) => {
      return ["dev", "dev:script"].map((s) => {
        const wait = x === "base"; // base的任务要先编译
        return { dir: `./packages/${x}`, name: s, wait };
      });
    })
    .flat();

  for await (const x of GenerateDevTask(packages)) {
    console.log(x);
  }
}
run();
