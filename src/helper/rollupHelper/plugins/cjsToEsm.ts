import { cacheGetter } from '@bfchain/util-decorator';
import { Inject, Injectable, ModuleStroge, Resolve } from '@bfchain/util-dep-inject';
import { ROLLUP_PRIFILE_ARGS } from '../const';
import type { Plugin } from 'rollup';
import { PathHelper } from '../../pathHelper';
import { Reader } from '../../reader';
import { RollupNodeResolve } from './nodeResolve';
import { BFS_PROJECT_ARG } from '../../const';
import { BFSProject } from '../../project';
import { Config } from '../../config';
import { Encoder } from '../../encoder';
import { Logger } from '../../logger';

@Injectable()
export class RollupCjsToEsm implements PKGM.RollupPlugin {
  static ARGS = {
    RUNTIME_MODE: ROLLUP_PRIFILE_ARGS.RUNTIME_MODE,
    BFS_PROJECT: BFS_PROJECT_ARG,
  };
  static from(
    args: {
      runtimeMode?: RollupCjsToEsm['runtimeMode'];
    },
    moduleMap = new ModuleStroge()
  ) {
    const ARGS = RollupCjsToEsm.ARGS;
    moduleMap.set(ARGS.RUNTIME_MODE, args.runtimeMode);
    return Resolve(RollupCjsToEsm, moduleMap);
  }
  readonly pluginName = 'cjs-to-esm';
  constructor(
    @Inject(RollupCjsToEsm.ARGS.RUNTIME_MODE, { optional: true })
    public readonly runtimeMode: PKGM.Profile.RuntimeMode | undefined,
    @Inject(RollupCjsToEsm.ARGS.BFS_PROJECT, { optional: true })
    public readonly bfsProject: BFSProject,
    private config: Config,
    private path: PathHelper,
    private reader: Reader,
    private encoder: Encoder,
    private logger: Logger,
    private nodeResolve: RollupNodeResolve
  ) {}

  @cacheGetter
  private get prod() {
    return this.runtimeMode === 'test' || this.runtimeMode === 'prod';
  }

  toPlugin(): Plugin {
    const { prod } = this;
    const cache = new Map<string, string | null>();
    return {
      name: this.pluginName,
      resolveId: (id) => {
        let content = cache.get(id);
        if (content === undefined) {
          content = null;
          let canTry = false;
          if (id.includes('/cjs/')) {
            canTry = true;
          } else if (!id.endsWith('.js') /* 可能不是文件，尝试使用模块进行查找 */) {
            const nodeModulePath = this.path.join(
              this.bfsProject.projectDirname,
              this.config.projectShadowDirname,
              'node_modules',
              id
            );
            const tryId = this.path.join(nodeModulePath, 'cjs');
            if (this.reader.isDirectory(tryId)) {
              try {
                const packageJson = this.encoder.encodeByFilepath<PKGM.Config.Package>(
                  this.path.join(nodeModulePath, 'package.json')
                );
                if (packageJson.main.startsWith('cjs/') || packageJson.main.includes('/cjs/')) {
                  id = this.path.join(nodeModulePath, packageJson.main);
                  canTry = true;
                }
              } catch {}
            }
          }
          if (canTry) {
            const tryReplaceDirs = [
              { oldDir: '/cjs/', newDir: '/esm/' },
              { oldDir: '\\cjs\\', newDir: '/esm/' },
            ];
            if (prod) {
              tryReplaceDirs.unshift({ oldDir: '\\cjs\\', newDir: '/esm-es5/' });
              tryReplaceDirs.unshift({ oldDir: '/cjs/', newDir: '/esm-es5/' });
              tryReplaceDirs.unshift({ oldDir: '\\cjs\\', newDir: '/esm-es6/' });
              tryReplaceDirs.unshift({ oldDir: '/cjs/', newDir: '/esm-es6/' });
            }
            t: for (const { oldDir, newDir } of tryReplaceDirs) {
              const index = id.indexOf(oldDir);
              if (index !== -1) {
                const tryPath = this.path.join(
                  id.slice(0, index),
                  newDir + id.slice(index + oldDir.length)
                );
                const tryFilepaths: string[] = [];
                if (this.reader.isDirectory(tryPath)) {
                  tryFilepaths.push(this.path.join(tryPath, 'index.js'));
                } else {
                  if (tryPath.endsWith('.js')) {
                    tryFilepaths.push(tryPath);
                  } else {
                    tryFilepaths.push(tryPath + '.js');
                  }
                }

                for (const filepath of tryFilepaths) {
                  if (this.reader.isFile(filepath)) {
                    content = filepath;
                    break t;
                  }
                }
              }
            }
          }
          cache.set(id, content);
        }
        return content;
      },
    };
  }
}
