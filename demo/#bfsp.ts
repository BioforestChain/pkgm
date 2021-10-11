import { defineConfig } from "@bfchain/pkgm";
export default defineConfig((info) => {
  const config: Bfsp.UserConfig = {
    name: "demo",
    exports: {
      ".": "./index.ts",
    },
  };
  return config;
});
