import { build, Loader, Plugin } from "@bfchain/pkgm-base/lib/esbuild";
import { EasyMap } from "@bfchain/pkgm-base/util/extends_map";
import {
  $BfspUserConfig,
  $getBfspUserConfig,
  $PackageJson,
  $readFromMjs,
  createTsconfigForEsbuild,
  DevLogger,
  doWatchDeps,
  fileIO,
  folderIO,
  getWatcher,
  SharedAsyncIterable,
  SharedFollower,
  toPosixPath,
  watchPackageJson,
  watchTsConfig,
  watchViteConfig,
  watchGitIgnore,
  watchNpmIgnore,
} from "@bfchain/pkgm-bfsp";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import path, { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
// import bfswTsconfigContent from "../../assets/tsconfig.bfsw.json?raw";
const bfswTsconfigContent = "{}";
import { consts } from "../consts";
import { States } from "./states";
import { WorkspaceConfigBase } from "./WorkspaceConfig.base";
import { LoadConfig } from "./WorkspaceConfig.loader";
import { WorkspacePackageJson } from "./workspacePackageJson";
import { WorkspaceTsConfig } from "./workspaceTsConfig";

export const defineWorkspace = (cb: () => Bfsw.Workspace) => {
  return cb();
};

const bfswTsconfigFilepath = createTsconfigForEsbuild(bfswTsconfigContent);

export type $ProjectConfigStreams = ReturnType<WorkspaceConfig["_createProjectConfigStreams"]>;
export type $ProjectConfigStreamsMap = Map<string, $ProjectConfigStreams>;
export type $WorkspaceWatcher = BFChainUtil.PromiseReturnType<typeof WorkspaceConfig["getWatcher"]>;

export class WorkspaceConfig extends WorkspaceConfigBase {
  static async from(workspaceRoot: string, logger: PKGM.Logger) {
    const config = await LoadConfig(workspaceRoot);
    if (config !== undefined) {
      return new WorkspaceConfig(workspaceRoot, config, logger);
    }
  }

  private async _reload() {
    const config = await LoadConfig(this.root);
    if (config === undefined) {
      return false;
    }

    this.states.clear();
    this._config = config;
    this._refreshProjectConfigStreamsMap(config);

    return true;
  }

  /**写入配置文件到磁盘 */
  async write() {}
  /**监听配置，转成流 */
  async watch() {}
  /**监听配置变动，将新的导出配置写入磁盘 */
  static async getWatcher(workspaceRoot: string) {
    const watcher = await getWatcher(workspaceRoot);

    //#region bfsw+bfsp
    watcher.doWatch(
      {
        expression: [
          "allof",
          [
            "anyof",
            //
            ["name", ["#bfsw.ts", "wholename"]],
            ["name", ["#bfsp.ts", "wholename"]],
          ],
          ["not", ["match", "**/node_modules/**", "wholename"]],
          ["not", ["match", "**/.*/**", "wholename"]],
        ],
        chokidar: [
          ["#bfsw.ts", "#bfsp.ts"].map((x) => `./**/${x}`),
          { cwd: workspaceRoot, ignoreInitial: true, ignored: [/node_modules*/, /\.bfsp*/] },
        ],
      },
      (p, type) => {
        for (const cb of bfswCbs) {
          try {
            cb(p, type);
          } catch {}
        }
      }
    );
    const bfswCbs = [] as Bfsp.WatcherHanlder[];
    //#endregion

    //#region tsfiles
    watcher.doWatch(
      {
        expression: [
          "allof",
          [
            "anyof",
            ["match", "**/*.ts", "wholename"],
            ["match", "**/*.tsx", "wholename"],
            ["match", "**/*.cts", "wholename"],
            ["match", "**/*.mts", "wholename"],
            ["match", "**/*.ctsx", "wholename"],
            ["match", "**/*.mtsx", "wholename"],
          ],
          ["not", ["match", "**/node_modules/**", "wholename"]],
          ["not", ["match", "**/build/**", "wholename"]], // @todo 转到 .bfsp 文件夹下
          ["not", ["match", "**/dist/**", "wholename"]], // @todo 转到 .bfsp 文件夹下
          ["not", ["match", "**/.*/**", "wholename"]],
        ],
        chokidar: [
          ["assets/**/*.json", "**/*.ts", "**/*.tsx", "**/*.cts", "**/*.mts", "**/*.ctsx", "**/*.mtsx"],
          {
            cwd: workspaceRoot,
            ignoreInitial: false,
            followSymlinks: true,
            ignored: [/.*\.d\.ts$/, /\.bfsp*/, /#bfsp\.ts$/, /node_modules*/],
          },
        ],
      },
      (p, type) => {
        const filepath = path.resolve(workspaceRoot, p);
        for (const [projectRoot, cbs] of tsCbMap) {
          if (filepath.startsWith(projectRoot)) {
            for (const cb of cbs) {
              try {
                cb(path.relative(projectRoot, filepath), type);
              } catch {}
            }
          }
        }
      }
    );

    const tsCbMap = EasyMap.from({
      creater: (_projectRoot: string) => {
        return [] as Array<Bfsp.WatcherHanlder>;
      },
    });
    //#endregion

    return Object.assign(
      {
        watchTs: (root: string, cb: Bfsp.WatcherHanlder) => {
          tsCbMap.forceGet(path.resolve(workspaceRoot, root)).push(cb);
        },
        // 不提供bfsp的监听功能，统一由bfsw来管理
        watchUserConfig() {},
      } as Bfsp.AppWatcher,
      {
        watchWorkspace(cb: Bfsp.WatcherHanlder) {
          bfswCbs.push(cb);
        },
      }
    );
  }
}
