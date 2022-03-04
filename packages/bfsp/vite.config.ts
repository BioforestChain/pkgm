import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { InputOption, ModuleFormat } from "rollup";
import { defineConfig, PluginOption } from "vite";
import { execSync } from "node:child_process";

const libFormat = (process.argv.find((arg) => arg.startsWith("--format="))?.split("=")[1] ?? "esm") as ModuleFormat;

export const input: InputOption = {
  index: "src/index.ts",
  postinstall: "script/postinstall.ts",
  bin: "bin.ts",
  test: "test.ts",
  "bfsp.bin": "bin/bfsp.cmd.ts",
  "config.test": "tests/config.test.ts",
  "build.test": "tests/build.test.ts",
  "util.test": "tests/util.test.ts",
  tsc_worker: "bin/tsc/worker.ts",
  terser_worker: "bin/terser/worker.ts",
};
export const extension =
  {
    es: ".mjs",
    esm: ".mjs",
    module: ".mjs",
    cjs: ".cjs",
    commonjs: ".cjs",
    umd: ".js",
    system: ".js",
    systemjs: ".js",
    iife: ".js",
    amd: ".js",
  }[libFormat] || ".js";

export const getShebangPlugin = (dirname: string) => {
  return {
    name: "shebang",
    banner: async () => {
      return "";
    },
    closeBundle: async () => {
      // const __filename = fileURLToPath(import.meta.url);
      // console.log(__filename)
      // const __dirname = path.dirname(__filename);
      const packageJsonPath = path.resolve(dirname, "./package.json");
      const packageJson = new Function(`return ${readFileSync(packageJsonPath, "utf-8")}`)();
      const bin = packageJson.bin;
      if (!(typeof bin === "object" && bin)) {
        return;
      }
      for (const binname in bin) {
        const binFilepath = path.resolve(dirname, bin[binname]);
        if (existsSync(binFilepath)) {
          writeFileSync(binFilepath, "#!/usr/bin/env node\n" + readFileSync(binFilepath));
          console.log(`inserted shebang to ${binFilepath}`);
        }
      }
    },
  } as PluginOption;
};
import "node:assert";
export default defineConfig((info) => {
  const nodejsModules = new Set([
    "assert",
    "async_hooks",
    "buffer",
    "child_process",
    "cluster",
    "console",
    "constants",
    "crypto",
    "dgram",
    "diagnostics_channel",
    "dns",
    "domain",
    "events",
    "fs",
    "http",
    "http2",
    "https",
    "index",
    "inspector",
    "module",
    "net",
    "os",
    "path",
    "perf_hooks",
    "process",
    "punycode",
    "querystring",
    "readline",
    "repl",
    "stream",
    "string_decoder",
    "timers",
    "tls",
    "trace_events",
    "tty",
    "url",
    "util",
    "v8",
    "vm",
    "wasi",
    "worker_threads",
    "zlib",
  ]);
  const depsInfo = JSON.parse(execSync("yarn list --prod --json").toString());
  const allowExternals = new Set<string>();
  for (const item of depsInfo.data.trees) {
    const pkgName = item.name.match(/(.+?)@/)[1];
    allowExternals.add(pkgName);
  }

  // const dirname = __dirname.replace(/\\/g, "/");
  const node_module_dirname = path.join(__dirname, "node_module").replace(/\\/g, "/") + "/";

  return {
    build: {
      target: "es2020",
      rollupOptions: {
        preserveEntrySignatures: "strict",
        external: (source, importer, isResolved) => {
          // nodejs协议模块
          if (source.startsWith("node:")) {
            return true;
          }
          if (
            // nodejs 直接模块
            nodejsModules.has(source) ||
            // nodejs 二级模块 比如 fs/promises
            (source.includes("/") && nodejsModules.has(source.split("/", 1)[1]))
          ) {
            return true;
          }

          /// node_modules文件夹里头的模块
          if (allowExternals.has(source)) {
            return true;
          }
          const posixSource = source.replace(/\\/g, "/");
          if (posixSource.startsWith(node_module_dirname)) {
            const fromModuleName = posixSource.slice(node_module_dirname.length).split("/", 1)[0];
            if (allowExternals.has(fromModuleName)) {
              return true;
            }
          }

          // if (source.startsWith("@bfchain/") || source.includes("node_modules/@bfchain/")) {
          //   return false;
          // }
          // if (source.includes("node_modules")) {
          //   return true;
          // }
          // if (!source.startsWith(".")) {
          //   if (existsSync(`node_modules/${source}`)) {
          //     return true;
          //   }
          // }
          console.log("include", source);
        },
        input,
        output: {
          entryFileNames: `[name]${extension}`,
          chunkFileNames: `chunk/[name]${extension}`,
          format: libFormat,
        },
      },
    },
    plugins: [getShebangPlugin(__dirname)],
  };
});
