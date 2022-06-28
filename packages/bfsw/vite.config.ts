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
    "bfsw.bin": "./dist/bin/bfsw.cmd.mjs",
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
