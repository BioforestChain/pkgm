import { EasyMap } from "@bfchain/pkgm-base/util/extends_map";
import { PromiseOut } from "@bfchain/pkgm-base/util/extends_promise_out";
import { getWatcher, writeBfspProjectConfig } from "@bfchain/pkgm-bfsp";
import path from "node:path";
import { WorkspaceConfigBase } from "./WorkspaceConfig.base";
import { LoadConfig } from "./WorkspaceConfig.loader";
export * from "./WorkspaceConfig.base";
export * from "./WorkspaceConfig.loader";
export * from "./WorkspaceConfig.watch";

export type $WorkspaceWatcher = BFChainUtil.PromiseReturnType<typeof WorkspaceConfig["getWatcher"]>;

export namespace WorkspaceConfig {
  // export type Options = {
  //   watch?: boolean;
  // };
}
export class WorkspaceConfig extends WorkspaceConfigBase {
  static async From(workspaceRoot: string, logger: PKGM.Logger) {
    const initConfig = await LoadConfig(workspaceRoot, { logger });
    if (initConfig !== undefined) {
      const wc = new WorkspaceConfig(workspaceRoot, initConfig, logger);
      return wc;
    }
  }
  static WatchFrom(workspaceRoot: string, logger: PKGM.Logger) {
    const ac = new AbortController();
    const wcPo = new PromiseOut<WorkspaceConfig>();
    (async () => {
      const initConfig = await LoadConfig(workspaceRoot, {
        single: ac.signal,
        watch: (newConfig) => {
          if (wcPo.value === undefined) {
            const wc = new WorkspaceConfig(workspaceRoot, newConfig, logger);
            wcPo.resolve(wc);
          } else {
            const wc = wcPo.value;
            wc._reload(newConfig);
          }
        },
        logger,
      });

      if (ac.signal.aborted) {
        return wcPo.reject(ac.signal);
      }

      if (initConfig !== undefined) {
        const wc = new WorkspaceConfig(workspaceRoot, initConfig, logger);
        wcPo.resolve(wc);
      }
    })();

    return {
      abortController: ac,
      workspaceConfigAsync: wcPo.promise,
    };
  }

  private async _reload(config: Bfsw.Workspace) {
    this.states.clear();
    this._config = config;
    this._refreshProjectConfigStreamsMap(config);
    this.write();

    return true;
  }

  /**写入配置文件到磁盘 */
  async write() {
    await this.packageJson.write();
    await this.tsConfig.write();
    // for (const [projectRoot, projectConfigStreams] of await this.projectConfigStreamsMapStream.getCurrent()) {
    //   writeBfspProjectConfig(
    //     {
    //       projectDirpath: projectRoot,
    //       bfspUserConfig: await projectConfigStreams.userConfigStream.getCurrent(),
    //     },
    //     { logger: this._logger }
    //   );
    // }
  }

  private _watching = false;
  /**监听配置，转成流 */
  async watch() {
    if (this._watching) {
      return;
    }
    this._watching = true;
  }
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
