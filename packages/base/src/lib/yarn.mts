import path from "node:path";
import { readFileSync } from "node:fs";
import { require } from "../toolkit/toolkit.require.mjs";
import { PromiseOut } from "@bfchain/util";
let yarnPath: string | undefined;
export const getYarnPath = () => {
  if (yarnPath === undefined) {
    const packageJsonFile = require.resolve("yarn/package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonFile, "utf-8"));
    yarnPath = path.join(path.dirname(packageJsonFile), packageJson.bin.yarn);
  }
  return yarnPath;
};

let yarnCli: ReturnType<typeof _initYarnCli> | undefined;
const _initYarnCli = async (onData: (data: unknown) => void, onError: (err: unknown) => void) => {
  const t = new PromiseOut<void>();
  process.stdout._write = (chunk, encoding, cb) => {
    t.resolve();
    onData(chunk);
    cb();
    return true;
  };
  process.stderr._write = (chunk, encoding, cb) => {
    /* ignore */
    cb();
    return true;
  };

  class ExitError extends Error {}
  process.exit = (code) => {
    throw new ExitError(`code: ${code}`);
  };

  process.on("uncaughtException", (e) => {
    if (e instanceof ExitError) {
      t.resolve();
    } else {
      onError(e);
    }
  });
  process.on("unhandledRejection", (e, p) => {
    if (e instanceof ExitError) {
      t.resolve();
    } else {
      onError(e);
    }
  });
  const packageJsonFile = require.resolve("yarn/package.json");
  const yarnPath = getYarnPath();
  process.argv = ["node", yarnPath, "--version"];
  const cli = require(path.join(path.dirname(packageJsonFile), "lib/cli.js"));

  /// 等待 yarn --version 返回
  await t.promise;
  const run = async (argv: string[]): Promise<void> => {
    process.argv = ["node", yarnPath, ...argv];
    try {
      await cli.default();
    } catch (err) {
      debugger;
    }
  };
  return { run };
};
export const getYarnCli = (onData: (data: unknown) => void, onError: (err: unknown) => void) => {
  if (yarnCli === undefined) {
    yarnCli = _initYarnCli(onData, onError);
  }
  return yarnCli;
};
