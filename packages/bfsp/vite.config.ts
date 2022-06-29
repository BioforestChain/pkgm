import { defineInputConfig, findInputConfig, getShebangPlugin } from "@bfchain/pkgm-base/vite-config-helper/index.mjs";
import { getVite, genRollupOptions } from "@bfchain/pkgm-base/lib/vite.mjs";
const defineConfig = getVite().defineConfig;

defineInputConfig({
  name: "bin",
  outDir: "build",
  input: {
    "bfsp.bin": "./dist/src/bin/bfsp.cmd.mjs",
    "worker/tsc": "./dist/src/bin/tsc/worker.mjs",
  },
  default: true,
});

export default defineConfig((info) => {
  const inputConfig = findInputConfig(info.mode);
  if (inputConfig === undefined) {
    throw new Error(`no found vite config in mode: ${info.mode}`);
  }

  return {
    build: {
      target: "node16",
      // target: "es2020",
      sourcemap: false,
      polyfillModulePreload: true,
      outDir: inputConfig.outDir,
      rollupOptions: genRollupOptions(inputConfig.input, __dirname),
    },
    plugins: [getShebangPlugin(__dirname)],
  };
});
