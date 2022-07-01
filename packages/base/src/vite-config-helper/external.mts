import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ExternalOption } from "rollup";
import { getYarnPath } from "../lib/yarn.mjs";

import { cpus } from "node:os";
import { ConcurrentTaskLimitter } from "../util/concurrent_limitter.mjs";

const spawnYarnLimitter = new ConcurrentTaskLimitter(cpus().length);

/**
 * @TODO 这里最好是做到缓存里头去，第一次启动慢一点，以后启动不要太慢。
 * @TODO 有没有可能一次性在 bfsw 环境里头执行完所有的 bfsp 的 getDepsInfo 的需求？
 */
const getDepsInfo = async () => {
  const task = await spawnYarnLimitter.genTask();
  try {
    const listSpawn = spawn("node", [getYarnPath(), "list", "--json", "--prod"]);
    let outputs = "";
    for await (const chunk of listSpawn.stdout) {
      outputs += chunk;
    }
    const data = JSON.parse(outputs);
    if (data.type === "tree" && data.data.type === "list") {
      return data;
    }
  } catch (e) {
    console.error(e);
  } finally {
    task.resolve();
  }
};

export const getExternalOption = async (
  dirname: string,
  currentPkgName?: string
): Promise<ExternalOption | undefined> => {
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

  const depsInfo = await getDepsInfo();
  if (!depsInfo?.data) return;
  if (currentPkgName === undefined) {
    currentPkgName = JSON.parse(readFileSync(path.resolve(dirname, "package.json"), "utf-8")).name as string;
  }

  const allowExternals = new Set<string>([currentPkgName]);
  for (const item of depsInfo.data.trees) {
    const pkgName = item.name.match(/(.+?)@/)[1];
    allowExternals.add(pkgName);
  }
  const disallowExternals = new Set(["@bfchain/pkgm-base", "@bfchain/pkgm-bfsp", "@bfchain/pkgm-bfsw"]);

  const node_module_dirname = path.join(dirname, "node_modules").replace(/\\/g, "/") + "/";

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

    /// node_modules文件夹里头的模块
    const fromModuleName = source.startsWith("@")
      ? source.split("/", 2).slice(0, 2).join("/")
      : source.split("/", 1)[0];

    if (disallowExternals.has(fromModuleName)) {
      return;
    }

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
  // return (...args) => {
  //   const res = ext(...args);
  //   if (!res) {
  //     console.log("inline source:", args[0]);
  //   }
  //   return res;
  // };
  return ext;
};
