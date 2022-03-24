import { defineConfig } from "vite";
import {
  defineInputConfig,
  extension,
  findInputConfig,
  getExternalOption,
  getShebangPlugin,
  libFormat,
} from "./vite-config-helper";
import path from "node:path";
import fs from "node:fs";

defineInputConfig({
  outDir: "main",
  input: {
    ...fs.readdirSync(path.join(__dirname, "lib")).reduce((res, name) => {
      res["lib/" + name.slice(0, -path.extname(name).length)] = "lib/" + name;
      return res;
    }, {} as any),
    ...fs.readdirSync(path.join(__dirname, "util")).reduce((res, name) => {
      res["util/" + name.slice(0, -path.extname(name).length)] = "util/" + name;
      return res;
    }, {} as any),
    "vite-config-helper": "./vite-config-helper/index.ts",
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
  if (inputConfig === undefined) {
    throw new Error(`no found vite config in mode: ${info.mode}`);
  }

  const buildOutDir = "dist/" + inputConfig.outDir;
  return {
    build: {
      target: "es2020",
      outDir: buildOutDir,
      rollupOptions: {
        preserveEntrySignatures: "strict",
        external: getExternalOption(__dirname),
        input: inputConfig.input,
        output: {
          entryFileNames: `[name]${extension}`,
          chunkFileNames: `chunk/[name]${extension}`,
          format: libFormat,
        },
      },
    },
    plugins: [
      getShebangPlugin(__dirname),
      {
        name: "update package.json",
        closeBundle: () => {
          if (inputConfig.outDir === "main") {
            const packageJsonPath = path.join(__dirname, "package.json");
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
            const exports: any = (packageJson.exports = {
              "./package.json": "./package.json",
            });
            for (const key in inputConfig.input) {
              exports[`./${key}`] = {
                import: `./${buildOutDir}/${key}.mjs`,
              };
            }
            fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
          }
        },
      },
    ],
  };
});
