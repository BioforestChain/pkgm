import fs from "node:fs";
import path from "node:path";
import { build } from "vite";
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

  const viteBuildConfig = await ViteConfigFactory({
    projectDirpath: root,
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

  const devOut = await build(viteBuildConfig);
})();
