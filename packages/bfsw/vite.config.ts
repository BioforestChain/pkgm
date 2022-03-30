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
    "bfsw.bin": "bin/bfsw.cmd.ts",
  },
  default: true,
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
