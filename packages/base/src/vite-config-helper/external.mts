import { readFileSync } from "node:fs";
import path from "node:path";
import type { ExternalOption } from "rollup";

// import { spawn } from "node:child_process";
// import { isDeepStrictEqual } from "node:util";
// import { getYarnPath } from "../lib/yarn.mjs";
// import { ConcurrentTaskLimitter } from "../util/concurrent_limitter.mjs";
// import { cpus } from "node:os";
// const spawnYarnLimitter = new ConcurrentTaskLimitter(cpus().length);
// const getDepsInfoOld = async (cwd: string) => {
//   const task = await YarnLimitter.genTask();
//   try {
//     const listSpawn = spawn("node", [getYarnPath(), "list", "--json", "--prod", "--cwd", cwd]);
//     let outputs = "";
//     for await (const chunk of listSpawn.stdout) {
//       outputs += chunk;
//     }
//     const data = JSON.parse(outputs);
//     if (data.type === "tree" && data.data.type === "list") {
//       return data;
//     }
//   } finally {
//     task.resolve();
//   }
// };
// const formatTrees = (data: any) => {
//   return data.data.trees
//     .sort((a: any, b: any) => a.name.localeCompare(b.name))
//     .map((a: any) => [a.name, ...(a.children?.map((c: any) => c.name) ?? [])]);
// };

import { $YarnListRes, runYarnListProd } from "../service/yarn/runner.mjs";
const getDepsInfo = async (cwd: string) => {
  const data = await runYarnListProd(cwd, { serviceId: "vite" });
  if (!data) {
    debugger;
  }
  return data;
  // const oldData = await getDepsInfoOld(cwd);
  // if (!isDeepStrictEqual(formatTrees(oldData), formatTrees(data))) {
  //   debugger;
  // }
};

export const getExternalOption = async (
  dirname: string,
  currentPkgName?: string,
  depsInfo?: $YarnListRes | $YarnListRes.Tree
): Promise<ExternalOption | undefined> => {
  if (currentPkgName === undefined) {
    currentPkgName = JSON.parse(readFileSync(path.resolve(dirname, "package.json"), "utf-8")).name as string;
  }
  const allowExternals = new Set<string>([currentPkgName]);

  depsInfo ??= await getDepsInfo(dirname);
  if (depsInfo) {
    const saveItems = (item: $YarnListRes.Tree | $YarnListRes.Child) => {
      const pkgName = item.name.match(/(.+?)@/)![1];
      allowExternals.add(pkgName);
      item.children?.forEach(saveItems);
    };
    if ("type" in depsInfo) {
      /// RootObject
      for (const item of depsInfo.data.trees) {
        saveItems(item);
      }
    } else {
      /// Tree
      saveItems(depsInfo);
    }
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
  return (...args) => {
    const res = ext(...args);
    // if (
    //   !res &&
    //   /^[\.\/]+/.test(args[0]) === false &&
    //   /^#/.test(args[0]) === false &&
    //   path.normalize(args[0]).startsWith(dirname) === false
    // ) {
    //   depsInfo;
    //   allowExternals;
    //   console.log("inline source:", args[0]);
    //   throw new Error(
    //     `missing dependencie of ${args[0]} from source-file: ${args[1] ? path.relative(dirname, args[1]) : "<null>"}`
    //   );
    // }
    return res;
  };
};

const nodejsModules = new Set(
  JSON.parse(
    '["assert","async_hooks","buffer","child_process","cluster","console","constants","crypto","dgram","diagnostics_channel","dns","domain","events","fs","http","http2","https","index","inspector","module","net","os","path","perf_hooks","process","punycode","querystring","readline","repl","stream","string_decoder","timers","tls","trace_events","tty","url","util","v8","vm","wasi","worker_threads","zlib"]'
  )
);
