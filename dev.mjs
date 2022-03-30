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
  const packages = [
    { dir: "base", name: "dev", wait: true },
    { dir: "base", name: "dev:script", wait: true },

    { dir: "bfsp", name: "dev:bin", wait: true },
    { dir: "bfsp", name: "dev" },

    { dir: "bfsw", name: "dev" },
  ].sort((a, b) => a.dir.localeCompare(b.dir));
  packages.forEach((x) => (x.dir = `./packages/${x.dir}`));

  for await (const x of GenerateDevTask(packages)) {
    console.log(`[${x}] task done`);
  }
}
run();
