import fs from "node:fs";
import path from "node:path";
import type { RollupWatcher } from "rollup";
import { build } from "vite";
import { getBfspProjectConfig } from "../src/bfspConfig";
import { generateViteConfig } from "../src/gen/viteConfig";
import { watchBfspUserConfig } from "../src/userConfig";
import { ViteConfigFactory } from "./vite-build-config-factory";

(async () => {
  const cwd = process.cwd();
  const maybeRoot = path.join(
    cwd,
    process.argv.filter((a) => a.startsWith(".")).pop() || ""
  );
  const root =
    fs.existsSync(maybeRoot) && fs.statSync(maybeRoot).isDirectory()
      ? maybeRoot
      : cwd;

  console.log("root", root);

  const config = await getBfspProjectConfig(root);
  if (config === undefined) {
    console.error("no found #bfsp project");
    process.exit(1);
  }
  const userConfigWatcher = watchBfspUserConfig(root, config.userConfig);
  let userConfig = config.userConfig;

  do {
    const viteConfig = await generateViteConfig(
      config.projectDirpath,
      userConfig
    );
    const viteBuildConfig = await ViteConfigFactory({
      projectDirpath: root,
      viteConfig,
    });

    viteBuildConfig.build = {
      ...viteBuildConfig.build!,
      watch: {
        clearScreen: false,
      },
      minify: false,
      sourcemap: true,
    };
    viteBuildConfig.mode = "development";

    const devOut = (await build(viteBuildConfig)) as RollupWatcher;

    const nextUserConfig = await userConfigWatcher.next();
    if (nextUserConfig.done) {
      process.exit(1);
    }
    userConfig = nextUserConfig.value;
    devOut.close();
  } while (true);
})();
