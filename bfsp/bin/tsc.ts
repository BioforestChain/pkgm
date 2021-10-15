import { readFileSync } from "node:fs";
import path from "node:path";
import { createContext, Script, runInContext } from "node:vm";
import { parentPort, workerData } from "node:worker_threads";
import { require } from "../src/toolkit";

export function doTsc() {
  const tscPath = path.resolve(require.resolve("typescript"), "../tsc.js");
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
  debugger;
  tscScript.runInContext(context);
  const ts = context.ts as typeof import("typescript");
  console.log(ts.sys.args);
  debugger;

  ts.sys.clearScreen = () => {
    parentPort?.postMessage("clearScreen");
  };
  ts.sys.write = (s) => {
    parentPort?.postMessage(["write", s]);
  };
  ts.sys.writeOutputIsTTY = () => true;
  //   ts as any.executeCommandLine(ts.sys, ts.noop, ts.sys.args);
  runInContext(`ts.executeCommandLine(ts.sys, ts.noop, ts.sys.args)`, context);
}

doTsc();
