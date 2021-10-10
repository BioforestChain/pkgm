import { createServer, build } from "vite";
import path from "node:path";
import fs from "node:fs";
import { getBfspProjectConfig } from "../src/bfspConfig";
import { generateViteConfig } from "../src/gen/viteConfig";
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
    return;
  }
  const viteConfig = await generateViteConfig(
    config.projectDirpath,
    config.userConfig
  );
  const buildConfig = ViteConfigFactory({
    projectDirpath: config.projectDirpath,
    input: viteConfig.viteInput,
  });

  buildConfig.build = {
    ...buildConfig.build!,
    watch: {
      clearScreen: false,
    },
    minify: false,
    sourcemap: true,
  };
  buildConfig.root = config.projectDirpath;
  buildConfig.mode = "development";

  const rollupOut = await build(buildConfig);
  // const server = await createServer({
  //   // 任何合法的用户配置选项，加上 `mode` 和 `configFile`
  //   configFile: false,
  //   root: __dirname,
  //   server: {
  //     port: 1337,
  //   },
  // });
  // await server.listen();
})();
