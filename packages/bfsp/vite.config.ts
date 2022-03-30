import {
  defineInputConfig,
  extension,
  findInputConfig,
  getExternalOption,
  getShebangPlugin,
  libFormat,
} from "@bfchain/pkgm-base/vite-config-helper";
import { getVite } from "@bfchain/pkgm-base/lib/vite";
const defineConfig = getVite().defineConfig;

defineInputConfig({
  outDir: "main",
  input: {
    index: "src/index.ts",
    "bfsp.bin": "bin/bfsp.cmd.ts",
    // "config.test": "tests/config.test.ts",
    // "build.test": "tests/build.test.ts",
    // "util.test": "tests/util.test.ts",
    tsc_worker: "bin/tsc/worker.ts",
    terser_worker: "bin/terser/worker.ts",
    test: "test.ts",
    sdk: "sdk/index.ts",
    // "w": "src/toolkit.watcher.ts",
  },
  default: true,
});
defineInputConfig({
  outDir: "bin",
  input: {
    bin: "bin.ts",
  },
});

export default defineConfig((info) => {
  const inputConfig = findInputConfig(info.mode);
  if (inputConfig === undefined) {
    throw new Error(`no found vite config in mode: ${info.mode}`);
  }

  return {
    build: {
      target: "es2020",
      outDir: "dist/" + inputConfig.outDir,
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
