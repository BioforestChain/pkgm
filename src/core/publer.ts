import { Inject, Injectable, ModuleStroge, Resolve } from '@bfchain/util-dep-inject';
import { BFSProject } from '../helper/project';
import { BFS_PROJECT_ARG } from '../helper/const';
import { Complier } from './complier';
import { Writer } from '../helper/writer';
import { PathHelper } from '../helper/pathHelper';
import { Config } from '../helper/config';
import execa from 'execa';
import { Reader } from '../helper/reader';
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
    private writer: Writer,
    private reader: Reader,
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

    console.log(`publishing ${packageName}, using registry ${opts.registry || 'default'}`);
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
    this.writer.writeFile(
      this.path.join(SHADOW_DIR, './tsconfig.publ.json'),
      JSON.stringify({ include: [], references: refs }, null, 2)
    );
    if (opts.version) {
      const v = opts.version;
      this._updateBfspVersion(pkg, v);
      subProjects.forEach((x) => {
        this._updateBfspVersion(x, v);
      });
    }
    const c = Complier.from({ bfsProject: this.bfsProject }, moduleMap);
    await c.doComplie({
      watch: false,
      rollup: false,
      mode: 'prod',
      clean: false,
      publ: true,
      tscBuildFinish: () => {
        if (opts.version) {
          const v = opts.version;
          this._updateNpmPackageVersion(pkg, v);
          subProjects.forEach((x) => {
            this._updateNpmPackageVersion(x, v);
          });
        }
        this._publishToNpm(subProjects, opts.registry);
      },
    });
  }
  private _updateBfspVersion(p: BFSProject, version: string) {
    const packageJsonFile = p.projectFilepath;
    const pkg = JSON.parse(String(this.reader.readFile(packageJsonFile)));
    pkg.version = version;
    this.writer.writeFile(packageJsonFile, JSON.stringify(pkg, null, 2));
  }
  private _updateNpmPackageVersion(p: BFSProject, version: string) {
    const packageJsonFile = this.path.join(p.packageDirpath, 'package.json');
    const pkg = JSON.parse(String(this.reader.readFile(packageJsonFile)));
    pkg.version = version;
    this.writer.writeFile(packageJsonFile, JSON.stringify(pkg, null, 2));
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
