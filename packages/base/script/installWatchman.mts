import { $, nothrow, os } from "zx";

function quiet(promise: any) {
  promise._quiet = true;
  return promise;
}
export const installWatchman = async (logger = console) => {
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

          if (await hasCommand("brew")) {
            await $`brew update`;
            await $`brew install watchman -y`;
          }
          break;
        }
        case "darwin": {
          if (await hasCommand("brew")) {
            await $`brew update`;
            await $`brew install watchman -y`;
          }
          if (await hasCommand("port")) {
            await $`port install watchman -y`;
          }
          break;
        }
        case "win32": {
          // logger.log("zzz");
          // if (await hasCommand("choco")) {
          await $`choco.exe install watchman -y`;
          // }
          break;
        }
      }
    } catch {}
    if (await hasNoWatchMan()) {
      logger.error("⚠️\tYou maybe need install 'watchman' in you system manually!");
      switch (os.platform()) {
        case "win32":
          logger.error(`https://facebook.github.io/watchman/docs/install.html#download-for-windows-beta`);
          break;
        case "linux":
        case "darwin":
          logger.error(
            `https://facebook.github.io/watchman/docs/install.html#installing-on-macos-or-linux-via-homebrew`
          );
          break;
        default:
          logger.error(`https://facebook.github.io/watchman/docs/install.html`);
      }
    } else {
      logger.log("✅\tPass environmental test");
    }
  } else {
    logger.log("✅\tPass environmental test");
  }
};
