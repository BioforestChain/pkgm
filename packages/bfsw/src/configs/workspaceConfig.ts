import { PromiseOut } from "@bfchain/pkgm-base/util/extends_promise_out";
import { WorkspaceConfigBase } from "./WorkspaceConfig.base";
import { LoadConfig } from "./WorkspaceConfig.loader";
export * from "./WorkspaceConfig.base";
export * from "./WorkspaceConfig.loader";

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
    wcPo.onSuccess((wc) => {
      wc.onDestroy(() => ac.abort());
    });

    (async () => {
      const initConfig = await LoadConfig(workspaceRoot, {
        signal: ac.signal,
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
  }

  private _watching = false;
  /**监听配置，转成流 */
  async watch() {
    if (this._watching) {
      return;
    }
    this._watching = true;
  }
}
