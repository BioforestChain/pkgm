import { Inject, Injectable } from '@bfchain/util-dep-inject';
import { EasyMap } from '@bfchain/util-extends-map';
import { sleep } from '@bfchain/util-extends-promise';
import { FunctionQuener } from '@bfchain/util-decorator';
import { Config } from './config';
import { BFS_PROJECT_ARG } from './const';
import { Encoder } from './encoder';
import { EnvHelper } from './envHelper';
import { PathHelper } from './pathHelper';
import { BFSProject } from './project';
import { Reader } from './reader';
import { Writer } from './writer';
import { Logger } from './logger';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

type AssetWatcherCtx = {
  assetList: PKGM.Config.BfsProject.Plugins.FullAsset[];
  watcher: PKGM.FS.Watcher | false;
};
type CloseAble = {
  close(): void;
};

@Injectable()
export class AssetsHelper {
  constructor(
    @Inject(BFS_PROJECT_ARG)
    private rootBfsProject: BFSProject,
    private path: PathHelper,
    private writer: Writer,
    private reader: Reader,
    private encoder: Encoder,
    private env: EnvHelper,
    private config: Config,
    private logger: Logger
  ) {}

  doProjectClone(projectDir: string, opts: { watch?: boolean }) {
    const watch = !!opts.watch;
    const projectConfigFilepath = this.path.join(projectDir, this.config.projectConfigFilename);

    const $assetWatcherCtxCacher = new MapCacher<string, AssetWatcherCtx>(
      (ctx) => ctx.watcher && ctx.watcher.close()
    );

    const $projectWatcherCacher = new MapCacher<string, ReturnType<AssetsHelper['doProjectClone']>>(
      (watcher) => watcher.close()
    );

    const _watchAndClone = new Subject();
    _watchAndClone.pipe(debounceTime(50)).subscribe(async () => {
      // 稍微等一下以确保文件完全变更完毕
      await sleep(50);
      try {
        const projectConfig = this.encoder.encodeByFilepath<PKGM.Config.BfsProject>(
          projectConfigFilepath
        );
        /// 监听子项目
        {
          const projectDirList = projectConfig.projects.map((projectName) =>
            this.path.join(projectDir, projectName)
          );
          $projectWatcherCacher.putKeys(projectDirList, (subProjectDir) =>
            this.doProjectClone(subProjectDir, opts)
          );
        }
        /// 监听配置
        {
          const packageDir = this.rootBfsProject.resolvePackageDirpath(projectConfig.name);
          const pluginAssets = projectConfig.plugins?.assets || [];
          if (pluginAssets.length > 0) {
            const innerEnv = this.env.getInnerEnv(projectConfig);
            this.env.resolveWithEnv(pluginAssets, innerEnv);
            //   console.log('pluginAssets', pluginAssets);
          }

          const fullAssetList = this._doClone(pluginAssets, projectDir, packageDir);
          const fromAssetMap = new EasyMap<string, PKGM.Config.BfsProject.Plugins.FullAsset[]>(
            () => []
          );
          for (const fullAsset of fullAssetList) {
            fromAssetMap.forceGet(fullAsset.fullFrom).push(fullAsset);
          }

          $assetWatcherCtxCacher.putKeys(
            fromAssetMap.keys(),
            (fullFrom) => {
              const watcher =
                watch &&
                this.reader.watch(fullFrom, {}, (event) => {
                  for (const asset of data.assetList) {
                    this.logger.debug(
                      `${asset.copy ? 'copy' : 'link'} %s => %s`,
                      this.logger.$.path(asset.fullFrom),
                      this.logger.$.path(asset.fullTo)
                    );
                    this.cloneAsset(asset, projectDir, packageDir);
                  }
                });
              const data: AssetWatcherCtx = {
                assetList: fromAssetMap.forceGet(fullFrom),
                watcher,
              };
              return data;
            },
            (ctx, fullFrom) => {
              ctx.assetList = fromAssetMap.forceGet(fullFrom);
            }
          );
        }
      } catch (err) {
        // this.logger.error(`[doProjectClone Fail:]`, err.message);
      }
    });

    /// 监听配置文件
    const watcher =
      watch && this.reader.watch(projectConfigFilepath, {}, () => _watchAndClone.next());
    _watchAndClone.next();

    /// 监听器
    const projectWatcher = {
      close() {
        watcher && watcher.close();
        $assetWatcherCtxCacher.clear();
        $projectWatcherCacher.clear();
      },
    };
    return projectWatcher;
  }
  parseAsset(asset: PKGM.Config.BfsProject.Plugins['assets'][0]) {
    if (typeof asset === 'string') {
      const copy = asset.startsWith('copy!');
      const realAssetPathname = copy ? asset.slice(5) : asset;
      const [from, to = from] = realAssetPathname.split('=>');
      asset = {
        copy,
        from,
        to,
      };
    } else {
      if (!asset.from) {
        return;
      }
      if (typeof asset.copy !== 'boolean') {
        asset.copy = !!asset.copy;
      }
      if (!asset.to) {
        asset.to = asset.from;
      }
    }
    return asset;
  }
  parseAssetList(assets: PKGM.Config.BfsProject.Plugins['assets']) {
    const result: PKGM.Config.BfsProject.Plugins.Asset[] = [];
    for (const asset of assets) {
      const parsedAsset = this.parseAsset(asset);
      if (parsedAsset) {
        result.push(parsedAsset);
      }
    }
    return result;
  }
  cloneAsset(asset: PKGM.Config.BfsProject.Plugins.Asset, fromDir: string, toDir: string) {
    if (!asset.fullFrom) {
      asset.fullFrom = this.path.resolve(fromDir, asset.from);
    }
    if (!asset.fullTo) {
      asset.fullTo = this.path.resolve(toDir, asset.to);
    }

    this.writer.clone(asset.fullFrom, asset.fullTo, asset.copy);
    return asset as PKGM.Config.BfsProject.Plugins.FullAsset;
  }
  /**执行插件的复制 */
  doClone(
    pluginAssets: PKGM.Config.BfsProject.Plugins['assets'],
    projectDir: string,
    packageDir: string
  ) {
    if (pluginAssets.length > 0) {
      const innerEnv = this.env.getInnerEnv(
        this.encoder.encodeByFilepath<PKGM.Config.BfsProject>(
          this.path.join(projectDir, this.config.projectConfigFilename)
        )
      );
      this.env.resolveWithEnv(pluginAssets, innerEnv);
    }
    return this._doClone(pluginAssets, projectDir, packageDir);
  }
  private _doClone(
    assets: PKGM.Config.BfsProject.Plugins['assets'],
    fromDir: string,
    toDir: string
  ) {
    const copyedAssetList: PKGM.Config.BfsProject.Plugins.FullAsset[] = [];
    for (const asset of this.parseAssetList(assets)) {
      copyedAssetList.push(this.cloneAsset(asset, fromDir, toDir));
    }
    return copyedAssetList;
  }
}

class MapCacher<K, V> {
  constructor(public readonly releaseValue: (value: V, key: K) => unknown) {}
  private _curMap = new Map<K, V>();
  putKeys(
    keys: Iterable<K>,
    getNewValue: (key: K) => V,
    updateCachedValue?: (value: V, key: K) => V | void
  ) {
    const oldMap = this._curMap;
    const newMap = new Map<K, V>();
    for (const key of keys) {
      // 尽可能复用缓存
      let cache = oldMap.get(key);
      if (cache) {
        if (updateCachedValue) {
          const newCache = updateCachedValue(cache, key);
          if (newCache !== undefined) {
            cache = newCache;
          }
        }
      } else {
        cache = getNewValue(key);
      }
      newMap.set(key, cache);
    }

    /// 遍历缓存，如果不存在于新缓存中，就删除
    for (const item of oldMap) {
      if (!newMap.has(item[0])) {
        this.releaseValue(item[1], item[0]);
      }
    }
  }
  clear() {
    for (const item of this._curMap) {
      this.releaseValue(item[1], item[0]);
    }
  }
}
