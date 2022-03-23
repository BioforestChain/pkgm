import {
  defineInputConfig,
  extension,
  findInputConfig,
  getExternalOption,
  getShebangPlugin,
  libFormat,
} from "@bfchain/pkgm-base/vite-config-helper";
import { defineConfig } from "vite";

defineInputConfig({
  outDir: "main",
  input: {
    index: "src/index.ts",
    "bfsw.bin": "bin/bfsw.cmd.ts",
  },
  default: true,
});
defineInputConfig({
  outDir: "script",
  input: {
    postinstall: "postinstall.ts",
  },
});
export default defineConfig((info) => {
  const inputConfig = findInputConfig(info.mode);

  return {
    build: {
      target: "node16",
      polyfillModulePreload: false,
      outDir: "dist/" + inputConfig.outDir,
      rollupOptions: {
        preserveEntrySignatures: "strict",
        external: getExternalOption(__dirname),
        input: inputConfig.input,
        preserveModules: true,
        output: {
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
