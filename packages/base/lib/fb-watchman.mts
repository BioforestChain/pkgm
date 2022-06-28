import { Client } from "fb-watchman";
import type { doneCallback } from "fb-watchman";

import { platform, arch } from "node:os";
import path from "node:path";
import { require } from "../src/toolkit.require.mjs";
import { spawnSync } from "node:child_process";
let watchmanBinaryPath: string | undefined;
/**
 * 检测是否有全局安装watchman
 */
const localWatchmanVersion = spawnSync("watchman", ["--version"]).stdout?.toString();
/**
 * 没有全局安装，使用本地依赖的版本
 */
if (localWatchmanVersion === undefined) {
  const binaryPkgName = `@bfchain/watchman-binary-${platform()}-${arch()}`;
  try {
    watchmanBinaryPath = require.resolve(binaryPkgName + "/binary");
  } catch (err) {
    console.error(err);
  }
  if (watchmanBinaryPath) {
    if (platform() !== "win32") {
      const libPath = path.join(path.dirname(watchmanBinaryPath), "../lib");
      const LD_LIBRARY_PATH = process.env["LD_LIBRARY_PATH"];
      if (LD_LIBRARY_PATH === undefined || LD_LIBRARY_PATH === "") {
        process.env["LD_LIBRARY_PATH"] = `${libPath}}`;
      } else {
        process.env["LD_LIBRARY_PATH"] = `${LD_LIBRARY_PATH}:${libPath}}`;
      }
    }
  } else {
    /**
     * @Todo 不支持watchman，应该使用其它库进行替代
     */
  }
}

export type WatchProjectResponse = {
  version: string;
  watch: string;
  watcher: string;
  warning?: string;
  relative_path: string;
};
export type SubscribeOptions = {
  fields?: string[];
  since?: string;
  relative_root?: string;
  expression: SubscribeOptions.Expression;
  chokidar?: {};
};
export namespace SubscribeOptions {
  export type Expression = string | Array<Expression>;
}

export class FbWatchmanClient extends Client {
  constructor() {
    super({
      watchmanBinaryPath,
    });
  }
  private _watchManChecker: Promise<void> | undefined;
  afterReady() {
    return (this._watchManChecker ??= new Promise<void>((resolve, reject) => {
      this.capabilityCheck({ optional: [], required: ["relative_root"] }, (error: unknown, resp: unknown) => {
        if (error) {
          reject(error);
          this.end();
        } else {
          resolve();
        }
      });
    }));
  }
  private _ref = 0;
  ref() {
    this._ref += 1;
  }
  unref() {
    this._ref -= 1;
    if (this._ref === 0) {
      this.end();
      return true;
    }
    return false;
  }
  commandAsync(args: [cmd: "watch-project", root: string]): Promise<WatchProjectResponse>;
  commandAsync(args: [cmd: "subscribe", watch: string, name: string, config: SubscribeOptions]): Promise<void>;
  commandAsync(args: [cmd: "unsubscribe", watch: string, name: string]): Promise<void>;
  commandAsync(args: [cmd: "watch-del", root: string]): Promise<void>;
  commandAsync(args: any) {
    return new Promise<any>((resolve, reject) => {
      super.command(args, (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      });
    });
  }
}
