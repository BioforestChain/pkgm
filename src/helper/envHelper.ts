import { Inject, ModuleStroge, Resolve } from '@bfchain/util-dep-inject';
import './@types';
import { Config } from './config';
import { BFS_PROJECT_ARG } from './const';
import { PathHelper } from './pathHelper';
import { BFSProject } from './project';

export class EnvHelper {
  static ARGS = {
    BFS_PROJECT: BFS_PROJECT_ARG,
  };
  static from(args: { bfsProject: BFSProject }, moduleMap = new ModuleStroge()) {
    moduleMap.set(EnvHelper.ARGS.BFS_PROJECT, args.bfsProject);
    return Resolve(EnvHelper, moduleMap);
  }
  constructor(
    @Inject(EnvHelper.ARGS.BFS_PROJECT)
    public readonly rootBfsProject: BFSProject,
    private config: Config,
    private path: PathHelper
  ) {}
  getInnerEnv<E>(projectConfig: PKGM.Config.BfsProject, extendsEnv?: E) {
    /// 基础的常量
    const innerEnv: PKGM.InnerEnv & E = Object.assign(
      Object.create(null),
      {
        BFSP_SHADOWN_DIRNAME: this.config.projectShadowDirname,
        BFSP_SHADOWN_DIR: this.path.join(
          this.rootBfsProject.projectDirname,
          this.config.projectShadowDirname,
          'node_modules',
          projectConfig.name
        ),
        BFSP_ROOT_DIR: this.rootBfsProject.projectDirname,
      } as PKGM.InnerEnv,
      extendsEnv
    );
    try {
      const packageJson = require(this.path.join(innerEnv.BFSP_SHADOWN_DIR, 'package.json'));
      innerEnv.BFSP_MAINFILE = this.path.join(innerEnv.BFSP_SHADOWN_DIR, packageJson.main);
      for (const key in packageJson) {
        const value = packageJson[key];
        Reflect.set(innerEnv, `NPM_${key.toUpperCase()}`, value);
      }
    } catch {}

    return innerEnv;
  }
  resolveWithEnv<T>(data: T, env: PKGM.Config.ENVS) {
    if (typeof data === 'string') {
      return (data.replace(/\$(\w+)|\$\{(\w+)\}/g, (_, key1, key2) => {
        const key = key1 || key2;
        if (key) {
          const value = env[key];
          if (value !== undefined) {
            return value;
          }
        }
        return _;
      }) as unknown) as T;
    }
    if (typeof data === 'object' && data !== null) {
      for (const key in data) {
        Reflect.set(
          (data as unknown) as object,
          key,
          this.resolveWithEnv(Reflect.get((data as unknown) as object, key), env)
        );
      }
    }
    return data;
  }
}
