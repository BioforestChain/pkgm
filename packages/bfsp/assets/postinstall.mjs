#!/usr/bin/env zx

// console.log(process.env.PATH);
const hasCommand =
  os.platform() === "win32"
    ? async (which) => {
        const info = (
          await quiet(
            nothrow($`powershell.exe -Command "Get-Command ${which}"`)
          )
        ).stdout;
        return "" !== info;
      }
    : async (which) => {
        const info = (await quiet(nothrow($`which ${which}`))).stdout;
        return "" !== info;
      };
const hasWatchMan = () => hasCommand("watchman");
const hasNoWatchMan = async () => false === (await hasCommand("watchman"));

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
      case "macos": {
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
    console.error(
      "⚠️ You maybe need install 'watchman' in you system manually"
    );
  } else {
    console.log("✅ Pass environmental test");
  }
} else {
  console.log("✅ Pass environmental test");
}
