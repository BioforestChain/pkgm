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
  pendingProjectMap = new Map<string, BFSProject>();

  static from(args: { bfsProject: BFSProject }, moduleMap = new ModuleStroge()) {
    moduleMap.set(Publer.ARGS.BFS_PROJECT, args.bfsProject);
    return Resolve(Publer, moduleMap);
  }
  async publish(opts: { packageName?: string; registry?: string; version?: string }) {
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
      console.error(`package ${packageName} not found!`);
      return;
    }
    const pkg = map.get(packageName)!;
    const refs: { path: string }[] = [];
    if (nameSpecified) {
      // 如果已经指定了名字，那么需要读取对应pkg的子项目
      subProjects = pkg.readAllProjectList();
    }

    subProjects.forEach((x) => {
      refs.unshift({
        path: `./${this.config.shadownRootPackageDirname}/${x.sourceConfig.name}/tsconfig.json`,
      });
    });

    const SHADOW_DIR = this.bfsProject.rootShadownDirpath;
    this.writer.writeFile(this.path.join(SHADOW_DIR, './tsconfig.publ.json'), {
      include: [],
      references: refs,
    });
    const checkAndUpdateVersion = (type: 'bfsp' | 'npm') => {
      if (opts.version) {
        const v = opts.version;
        this._updateVersion(pkg, v, type, packageName);
        subProjects.forEach((x) => {
          this._updateVersion(x, v, type, packageName);
        });
      }
    };

    await this.initer.reLink();
    const c = Complier.from({ bfsProject: this.bfsProject }, moduleMap);
    await c.doComplie({
      watch: false,
      rollup: false,
      mode: 'prod',
      clean: true,
      publ: true,
      tscBuildFinish: () => {
        checkAndUpdateVersion('bfsp');
        checkAndUpdateVersion('npm');
        this._publishToNpm(subProjects, opts.registry);
      },
    });
  }

  private _updateVersion(
    p: BFSProject,
    version: string,
    type: 'bfsp' | 'npm',
    packageName: string
  ) {
    let path = p.projectFilepath;
    if (type === 'npm') {
      path = this.path.join(p.packageDirpath, 'package.json');
    }

    const pkg = JSON.parse(String(this.reader.readFile(path)));
    // update dependencies
    switch (type) {
      case 'bfsp':
        {
          const deps = ((pkg.dependencies || []) as any[])
            .map((x) => {
              if (Array.isArray(x)) {
                return [x[0], x.length > 1 ? x[1] : '*'];
              }
              switch (typeof x) {
                case 'string':
                  return [x, '*'];
                case 'object':
                  return [x.name, x.version || '*'];
                default:
                  return null; //can not parse
              }
            })
            .filter((x) => x) as [name: string, version: string][];

          deps.forEach((dep) => {
            if (dep[0].startsWith(packageName)) {
              dep[1] = `^${version}`;
            }
          });
          pkg.dependencies = deps;
        }
        break;
      case 'npm':
        {
          const deps = pkg.dependencies || {};
          Object.keys(deps).forEach((x) => {
            if (x.startsWith(packageName)) {
              deps[x] = `^${version}`;
            }
          });
          pkg.dependencies = deps;
        }
        break;
    }

    pkg.version = version;

    this.writer.writeFile(path, pkg);
  }

  private _publishToNpm(projects: Map<string, BFSProject>, registry?: string) {
    projects.forEach((x) => {
      let cmd = `npm publish ${x.packageDirpath}`;
      if (registry) {
        cmd += ` --registry=${registry}`;
      }
      execa.commandSync(cmd, {
        cwd: x.packageDirpath,
        stdio: 'inherit',
      });
    });
  }
}
