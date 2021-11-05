import { readFileSync } from "node:fs";
import path from "node:path";
import { createContext, runInContext, Script } from "node:vm";
import { isMainThread, parentPort } from "node:worker_threads";
import { require, tryRequireResolve } from "../src/toolkit";

export function doTsc() {
  const tscPath = path.resolve(tryRequireResolve(require, "typescript"), "../tsc.js");
  const tscDirname = path.dirname(tscPath);
  const context = createContext({
    require,
    process,
    ts: {},
    setTimeout,
    clearTimeout,
    __filename: tscPath,
    __dirname: tscDirname,
  });
  const tscScript = new Script(
    readFileSync(tscPath, "utf-8")
      .replace(/var ts;/g, "/* var ts */;")
      .replace(`ts.executeCommandLine(ts.sys, ts.noop, ts.sys.args);`, "")
  );
  tscScript.runInContext(context);
  const ts = context.ts as typeof import("typescript");

  if (parentPort) {
    ts.sys.clearScreen = () => {
      parentPort!.postMessage(["clearScreen"]);
    };
    ts.sys.write = (s) => {
      parentPort!.postMessage(["write", s]);
    };
    ts.sys.exit = (c) => {
      parentPort!.postMessage(["exit", c]);
    };
    ts.sys.writeOutputIsTTY = () => true;
  }

  return {
    ts,
    start() {
      runInContext(`ts.executeCommandLine(ts.sys, ts.noop, ts.sys.args)`, context);
    },
  };
}

/// 如果在worker中,直接运行即可
if (isMainThread === false) {
  doTsc().start();
}
