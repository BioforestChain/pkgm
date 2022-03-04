import { $, nothrow, os } from "zx";

function quiet(promise: any) {
  promise._quiet = true;
  return promise;
}
(async () => {
  const hasCommand =
    os.platform() === "win32"
      ? async (cmd: string) => {
          const info = (await quiet(nothrow($`powershell.exe -Command "Get-Command ${cmd}"`))).stdout;
          return "" !== info;
        }
      : async (cmd: string) => {
          const info = (await quiet(nothrow($`which ${cmd}`))).stdout;
          return "" !== info;
        };
  const hasWatchMan = () => hasCommand("watchman");
  const hasNoWatchMan = async () => false === (await hasWatchMan());

  if (await hasNoWatchMan()) {
    try {
      switch (os.platform()) {
        case "linux": {
          const z = await quiet($`lsb_release -a`);
          const distributor = z.stdout
            .match(/Distributor ID:(.+)/)?.[1]
            .trim()
            .toLowerCase();

          if (await hasCommand("apt-get")) {
            await $`sudo apt-get install watchman -y`;
          }

          if ((await hasNoWatchMan()) && (await hasCommand("dnf"))) {
            await $`sudo dnf copr enable eklitzke/watchman`;
            await $`sudo dnf install watchman -y`;
          }
          if ((await hasNoWatchMan()) && (await hasCommand("yum"))) {
            await $`sudo yum install watchman -y`;
          }

          break;
        }
        case "darwin": {
          // if (await hasCommand("brew")) {
          await $`brew install watchman -y`;
          // }
          break;
        }
        case "win32": {
          // console.log("zzz");
          // if (await hasCommand("choco")) {
          await $`choco.exe install watchman -y`;
          // }
          break;
        }
      }
    } catch {}
    if (await hasNoWatchMan()) {
      console.error("⚠️\tYou maybe need install 'watchman' in you system manually");
    } else {
      console.log("✅\tPass environmental test");
    }
  } else {
    console.log("✅\tPass environmental test");
  }
})();

///
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
(async () => {
  const require = createRequire(import.meta.url);
  const pkgDirname = path.dirname(require.resolve("@bfchain/pkgm-bfsp/package.json"));
  const nmBfchainDirname = path.resolve(pkgDirname, "node_modules/@bfchain");
  for (const pkgName of fs.readdirSync(nmBfchainDirname)) {
    const packageJsonFilepath = path.join(nmBfchainDirname, pkgName, "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonFilepath, "utf-8"));
    if (packageJson.type !== "module" && packageJson.exports === undefined) {
      if (!packageJson.types) {
        packageJson.types = packageJson.type;
      }
      packageJson.type = "module";
      packageJson.exports = {
        ".": {
          require: packageJson.main.startsWith("./") ? packageJson.main : "./" + packageJson.main,
          import: packageJson.module.startsWith("./") ? packageJson.module : "./" + packageJson.module,
        },
      };
      fs.writeFileSync(packageJsonFilepath, JSON.stringify(packageJson, null, 2));
    }
  }
})();
