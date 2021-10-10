import { defineConfig, BfspUserConfig } from "@bfchain/pkgm";
export default defineConfig((info) => {
  const config: BfspUserConfig = {
    name: "demo",
    exports: {
      ".": "./index.ts",
    },
  };
  return config;
});
