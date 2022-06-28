import {
  defineInputConfig,
  extension,
  findInputConfig,
  getExternalOption,
  getShebangPlugin,
  libFormat,
} from "@bfchain/pkgm-base/vite-config-helper/index.mjs";
import { getVite } from "@bfchain/pkgm-base/lib/vite.mjs";
const defineConfig = getVite().defineConfig;

defineInputConfig({
  name: "bin",
  outDir: "build",
  input: {
    index: "src/index.ts",
    "bfsp.bin": "bin/bfsp.cmd.ts",
    // "config.test": "tests/config.test.ts",
    // "build.test": "tests/build.test.ts",
    // "util.test": "tests/util.test.ts",
    tsc_worker: "bin/tsc/worker.ts",
    // terser_worker: "bin/terser/worker.ts",
    test: "test.ts",
    sdk: "sdk/index.ts",
    // "w": "src/toolkit.watcher.ts",
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
      target: "es2020",
      outDir: inputConfig.outDir,
      rollupOptions: {
        preserveEntrySignatures: "strict",
        external: getExternalOption(__dirname),
        input: inputConfig.input,
        output: {
          preserveModules: true,
          manualChunks: undefined,
          entryFileNames: `[name]${extension}`,
          chunkFileNames: `chunk/[name]${extension}`,
          format: libFormat,
        },
      },
    },
    plugins: [getShebangPlugin(__dirname)],
  };
});
