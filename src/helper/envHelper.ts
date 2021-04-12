import { Inject, ModuleStroge, Resolve, Resolvable } from '@bfchain/util-dep-inject';
import './@types';
import { Config } from './config';
import { BFS_PROJECT_ARG } from './const';
import { PathHelper } from './pathHelper';
import { BFSProject } from './project';
import { Reader } from './reader';

@Resolvable()
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
    private reader: Reader,
    private path: PathHelper
  ) {}
  getInnerEnv<E>(projectConfig: PKGM.Config.BfsProject, extendsEnv?: E) {
    /// 基础的常量
    const innerEnv: Partial<PKGM.InnerEnv> & E = Object.assign(Object.create(null), extendsEnv);

    if (innerEnv.BFSP_SHADOWN_DIRNAME === undefined) {
      innerEnv.BFSP_SHADOWN_DIRNAME = this.config.projectShadowDirname;
    }
    if (innerEnv.BFSP_SHADOWN_DIR === undefined) {
      innerEnv.BFSP_SHADOWN_DIR = this.path.join(
        this.rootBfsProject.projectDirname,
        this.config.projectShadowDirname,
        'node_modules',
        projectConfig.name
      );
    }
    if (innerEnv.BFSP_DIR === undefined) {
      innerEnv.BFSP_DIR = this.rootBfsProject.projectDirname;
    }
    if (innerEnv.BFSP_ROOT_DIR === undefined) {
      innerEnv.BFSP_ROOT_DIR =
        this.rootBfsProject.rootBfsProject?.projectDirname || this.rootBfsProject.projectDirname;
    }
    if (innerEnv.PWD === undefined) {
      innerEnv.PWD = this.path.cwd;
    }
    const packageJsonpath = this.path.join(innerEnv.BFSP_SHADOWN_DIR, 'package.json');
    let BFSP_MAINFILE = this.path.join(innerEnv.BFSP_SHADOWN_DIR, 'index.js');

    if (this.reader.exists(packageJsonpath)) {
      const packageJsonContent = this.reader.readFile(packageJsonpath, 'utf-8');
      try {
        const packageJson = JSON.parse(packageJsonContent);
        if (packageJson.main !== undefined) {
          BFSP_MAINFILE = this.path.join(innerEnv.BFSP_SHADOWN_DIR, packageJson.main);
        }
        for (const key in packageJson) {
          let value = packageJson[key];
          if (typeof value === 'object') {
            value = JSON.stringify(value);
          }
          Reflect.set(innerEnv, `NPM_${key.toUpperCase()}`, value);
        }
      } catch {}
    }
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
