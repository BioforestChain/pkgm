import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
// import { setTimeout } from "node:timers/promises";
import path from "node:path";
import { createContext, runInContext } from "node:vm";
import { isMainThread, parentPort, workerData } from "node:worker_threads";
import { require, tryRequireResolve } from "../../src/toolkit";

export function doAva(root = process.cwd()) {
  //   const log = parentPort ? (...args) => parentPort!.postMessage(["log", args]) : console.log;
  const avaPath = tryRequireResolve(require, "ava/lib/cli");
  const avaRequire = createRequire(avaPath);

  const context = createContext({
    require: avaRequire,
    exports: {},
    process,
    setTimeout,
    clearTimeout,
    __filename: avaPath,
    __dirname: path.dirname(avaPath),
  });

  return {
    context,
    async start(options: { debug?: boolean } = {}) {
      runInContext(
        readFileSync(avaPath, "utf-8")
          .replace(
            `conf = await loadConfig({configFile});`,
            `conf = await loadConfig({configFile,resolveFrom:${JSON.stringify(root)}});`
          )
          .replace(
            `const activeInspector = require('inspector').url() !== undefined;`,
            `const activeInspector = ${options.debug ? true : false}`
          ),
        context
      );

      await context.exports.run();

      setTimeout(() => {
        process.exit(0);
      }, 100);
    },
  };
}

/// 如果在worker中,直接运行即可
if (isMainThread === false) {
  doAva(workerData.root).start({ debug: workerData.debug });
}
