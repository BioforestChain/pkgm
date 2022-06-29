import { genRollupOptions, getVite } from "@bfchain/pkgm-base/lib/vite.mjs";
import { defineInputConfig, findInputConfig, getShebangPlugin } from "@bfchain/pkgm-base/vite-config-helper/index.mjs";
const defineConfig = getVite().defineConfig;

defineInputConfig({
  name: "bin",
  outDir: "build",
  input: {
    "bfsw.bin": "./dist/src/bin/bfsw.cmd.mjs",
  },
  default: true,
});
export default defineConfig((info) => {
  const inputConfig = findInputConfig(info.mode);
  if (!inputConfig) {
    throw new Error(`no found input config with mode:'${info.mode}'`);
  }

  return {
    build: {
      target: "node16",
      polyfillModulePreload: false,
      outDir: inputConfig.outDir,
      rollupOptions: genRollupOptions(inputConfig.input, __dirname),
    },
    plugins: [getShebangPlugin(__dirname)],
  };
});
