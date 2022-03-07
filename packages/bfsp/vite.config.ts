import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { InputOption, ModuleFormat, ExternalOption } from "rollup";
import { defineConfig, PluginOption } from "vite";
import { execSync } from "node:child_process";

const libFormat = (process.argv.find((arg) => arg.startsWith("--format="))?.split("=")[1] ?? "esm") as ModuleFormat;

export const defaultInput: InputOption = {
  index: "src/index.ts",
  "bfsp.bin": "bin/bfsp.cmd.ts",
  "config.test": "tests/config.test.ts",
  "build.test": "tests/build.test.ts",
  "util.test": "tests/util.test.ts",
  tsc_worker: "bin/tsc/worker.ts",
  terser_worker: "bin/terser/worker.ts",
  test: "test.ts",
  bin: "bin.ts",
};
// export const testInput: InputOption = {
// };
// export const binInput: InputOption = {
// };
export const scriptInput: InputOption = {
  postinstall: "script/postinstall.ts",
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

export const getExternalOption = (currentPkgName?: string) => {
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
  if (currentPkgName === undefined) {
    currentPkgName = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf-8")).name;
  }
  const allowExternals = new Set<string>([currentPkgName]);
  for (const item of depsInfo.data.trees) {
    const pkgName = item.name.match(/(.+?)@/)[1];
    allowExternals.add(pkgName);
  }

  // const dirname = __dirname.replace(/\\/g, "/");
  const node_module_dirname = path.join(__dirname, "node_module").replace(/\\/g, "/") + "/";

  const viteInnerSources = new Set(["vite/preload-helper"]);
  const ext: ExternalOption = (source, importer, isResolved) => {
    if (viteInnerSources.has(source)) {
      return;
    }
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
    // if (!source.startsWith(".") && !source.startsWith("E:/")) {
    //   console.log("source", source, importer);
    // }

    /// node_modules文件夹里头的模块
    const fromModuleName = source.startsWith("@")
      ? source.split("/", 2).slice(0, 2).join("/")
      : source.split("/", 1)[0];
    if (allowExternals.has(fromModuleName)) {
      // console.log("[true]", fromModuleName);
      return true;
    }

    const posixSource = source.replace(/\\/g, "/");
    if (posixSource.startsWith(node_module_dirname)) {
      const fromModulePath = posixSource.slice(node_module_dirname.length);
      const fromModuleName = fromModulePath.startsWith("@")
        ? fromModulePath.split("/", 2).slice(0, 2).join("/")
        : fromModulePath.split("/", 1)[0];

      // console.log("fromModuleName", fromModuleName);
      if (allowExternals.has(fromModuleName)) {
        // console.log("[true]", fromModuleName);
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
    // console.log("include", source);
  };
  return ext;
};

export default defineConfig((info) => {
  const { mode } = info;
  let modeOutDir = "main";
  let modeInput = defaultInput;
  /* if (mode === "test") {
    modeInput = testInput;
    modeOutDir = "test";
  } else if (mode === "bin") {
    modeInput = binInput;
    modeOutDir = "bin";
  } else */ if (mode === "script") {
    modeInput = scriptInput;
    modeOutDir = "script";
  }

  return {
    build: {
      target: "es2020",
      outDir: "dist/" + modeOutDir,
      rollupOptions: {
        preserveEntrySignatures: "strict",
        external: getExternalOption(),
        input: modeInput,
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
