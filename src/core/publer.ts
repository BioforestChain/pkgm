import { Inject, Injectable, ModuleStroge, Resolve } from '@bfchain/util-dep-inject';
import { BFSProject } from '../helper/project';
import { BFS_PROJECT_ARG } from '../helper/const';
import { Complier } from './complier';
import { Writer } from '../helper/writer';
import { PathHelper } from '../helper/pathHelper';
import { Config } from '../helper/config';
import execa from 'execa';
import { Reader } from '../helper/reader';
import { Initer } from './initer';
import { Logger } from '../helper/logger';
type ProjectType = 'bfsp' | 'npm';
/**
 * 推送者，将项目的某一版本正式对外发布出去
 */
@Injectable()
export class Publer {
  static ARGS = {
    BFS_PROJECT: BFS_PROJECT_ARG,
  };
  constructor(
    @Inject(Publer.ARGS.BFS_PROJECT)
    public readonly bfsProject: BFSProject,
    private path: PathHelper,
    private initer: Initer,
    private writer: Writer,
    private reader: Reader,
    private logger: Logger,
    private config: Config
  ) {}

  static from(args: { bfsProject: BFSProject }, moduleMap = new ModuleStroge()) {
    moduleMap.set(Publer.ARGS.BFS_PROJECT, args.bfsProject);
    return Resolve(Publer, moduleMap);
  }
  async publish(opts: {
    packageName?: string;
    registry?: string;
    access?: string;
    version?: string;
    clean?: boolean;
  }) {
    const nameSpecified = opts.packageName !== undefined;
    const packageName = opts.packageName || this.bfsProject.projectConfig.name;

    this.logger.info(`publishing ${packageName}, using registry ${opts.registry || 'default'}`);
    const moduleMap = new ModuleStroge();
    const map = new Map<string, BFSProject>();
    let subProjects = this.bfsProject.readAllProjectList();
    subProjects.forEach((x) => {
      map.set(x.projectConfig.name, x);
    });
    if (nameSpecified && !map.has(packageName)) {
      this.logger.error(`package ${packageName} not found!`);
      return;
    }
    const pkg = map.get(packageName)!;
    const refs: { path: string }[] = [];
    if (nameSpecified) {
      // 如果已经指定了名字，那么需要读取对应pkg的子项目
      subProjects = pkg.readAllProjectList();
    }
    const subProjectNames: string[] = [];
    subProjects.forEach((x) => {
      subProjectNames.push(x.projectConfig.name);
      refs.unshift({
        path: `./${this.config.shadownRootPackageDirname}/${x.projectConfig.name}/tsconfig.cjs.json`,
      });
      refs.unshift({
        path: `./${this.config.shadownRootPackageDirname}/${x.projectConfig.name}/tsconfig.esm.json`,
      });
    });

    const SHADOW_DIR = this.bfsProject.rootShadownDirpath;
    this.writer.writeFile(this.path.join(SHADOW_DIR, './tsconfig.publ.json'), {
      include: [],
      references: refs,
    });
    const checkAndUpdateVersion = (
      type: ProjectType,
      updateType: { self: boolean; deps: boolean }
    ) => {
      if (opts.version) {
        const v = opts.version;
        // subProjects默认会包含pkg
        // this._updateVersion(pkg, v, type, packageName);
        subProjects.forEach((x) => {
          this.updateVersion(x, v, type, subProjectNames, updateType);
        });
      }
    };

    await this.initer.reLink();
    const c = Complier.from({ bfsProject: this.bfsProject }, moduleMap);
    await c.doComplie({
      watch: false,
      rollup: false,
      mode: 'prod',
      clean: opts.clean,
      publ: true,
      tscBuildFinish: () => {
        checkAndUpdateVersion('bfsp', { self: true, deps: true });
        checkAndUpdateVersion('npm', { self: true, deps: true });
        this._publishToNpm(subProjects, opts.registry, opts.access);
      },
    });
  }

  updateVersion(
    p: BFSProject,
    version: string,
    type: ProjectType,
    subProjectNames: string[],
    updateType: { self: boolean; deps: boolean }
  ) {
    if (!updateType.self && !updateType.deps) {
      return;
    }
    let path = p.projectFilepath;
    if (type === 'npm') {
      path = this.path.join(p.packageDirpath, 'package.json');
    }

    const pkg = JSON.parse(String(this.reader.readFile(path)));
    if (updateType.deps) {
      // update dependencies
      this.updateDepsVersion(pkg, version, type, subProjectNames);
    }
    if (updateType.self) {
      pkg.version = version;
    }

    this.writer.writeFile(path, pkg);
  }
  updateDepsVersion(
    pkg: PKGM.Config.Package | PKGM.Config.BfsProject,
    version: string,
    type: ProjectType,
    subProjectNames: string[]
  ) {
    const { name } = pkg;
    switch (type) {
      case 'bfsp':
        {
          const deps = (pkg.dependencies || []) as any[];
          deps.forEach((x, index) => {
            let depName = '';
            if (Array.isArray(x)) {
              depName = x[0];
            } else {
              switch (typeof x) {
                case 'string':
                  {
                    // 有些项是带版本的
                    // 比如 socket.io-client:~1.7.4
                    // 或者 @bfchain/util@1.2.9

                    let idx = x.lastIndexOf('@');
                    if (idx <= 0) {
                      // 没有指定版本
                      depName = x;
                    } else {
                      depName = x.substring(0, idx);
                    }
                    idx = x.lastIndexOf(':');
                    if (idx < 0) {
                      // 没有指定版本
                      depName = x;
                    } else {
                      depName = x.substring(0, idx);
                    }
                  }
                  break;
                case 'object':
                  {
                    depName = x.name;
                  }
                  break;
              }
            }
            if (subProjectNames.indexOf(depName) >= 0) {
              this.logger.info(`\t[bfsp.json] ${name} dep:\t${depName} => ${version}`);
              deps[index] = [depName, `^${version}`];
            }
          });

          pkg.dependencies = deps;
        }
        break;
      case 'npm':
        {
          const deps = pkg.dependencies as PKGM.Config.DEPS;
          Object.keys(deps).forEach((x) => {
            if (subProjectNames.indexOf(x) >= 0) {
              this.logger.info(`\t[package.json] ${name} dep:\t${x} => ${version}`);
              deps[x] = `^${version}`;
            }
          });
          pkg.dependencies = deps;
        }
        break;
    }
  }

  private _publishToNpm(projects: Map<string, BFSProject>, registry?: string, access?: string) {
    projects.forEach((x) => {
      let cmd = `npm publish ${x.packageDirpath}`;
      if (registry) {
        cmd += ` --registry=${registry}`;
      }
      if (access && access === 'public') {
        cmd += ` --access=public`;
      }
      execa.commandSync(cmd, {
        cwd: x.packageDirpath,
        stdio: 'inherit',
      });
    });
  }
}
