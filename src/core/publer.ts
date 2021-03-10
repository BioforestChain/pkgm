import { Inject, Injectable, ModuleStroge, Resolve } from '@bfchain/util-dep-inject';
import { BFSProject } from '../helper/project';
import { BFS_PROJECT_ARG } from '../helper/const';
import { Complier } from './complier';
import { Writer } from '../helper/writer';
import { PathHelper } from '../helper/pathHelper';
import { Config } from '../helper/config';
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
    private config: Config
  ) {}
  pendingProjectMap = new Map<string, BFSProject>();

  static from(args: { bfsProject: BFSProject }, moduleMap = new ModuleStroge()) {
    moduleMap.set(Publer.ARGS.BFS_PROJECT, args.bfsProject);
    return Resolve(Publer, moduleMap);
  }
  async publish(packageName: string) {
    console.log(`publishing ${packageName}`);
    const moduleMap = new ModuleStroge();
    const map = new Map<string, BFSProject>();
    this.bfsProject.readAllProjectList().forEach((x) => {
      map.set(x.projectConfig.name, x);
    });
    if (!map.has(packageName)) {
      console.error(`package ${packageName} not found!`);
      return;
    }
    const targets = new Map<string, BFSProject>();

    map
      .get(packageName)!
      .readAllProjectList()
      .forEach((x) => {
        targets.set(x.projectConfig.name, x);
      });
    for (const v of targets.keys()) {
      this.resolveDependencies(targets.get(v)!, map, targets, moduleMap);
    }
    const refs = [];

    for (const v of targets.keys()) {
      const p = targets.get(v)!;
      refs.unshift({
        path: `./${this.config.shadownRootPackageDirname}/${p.sourceConfig.name}/tsconfig.json`,
      });
    }
    const SHADOW_DIR = this.bfsProject.rootShadownDirpath;
    this.writer.writeFile(
      this.path.join(SHADOW_DIR, './tsconfig.publ.json'),
      JSON.stringify({ include: [], references: refs })
    );

    const c = Complier.from({ bfsProject: this.bfsProject }, moduleMap);
    await c.doComplie({
      watch: false,
      rollup: false,
      mode: 'prod',
      clean: false,
      publ: true,
    });
  }
  resolveDependencies(
    p: BFSProject,
    map: Map<string, BFSProject>,
    targets: Map<string, BFSProject>,
    moduleMap: ModuleStroge
  ) {
    if (p.sourceConfig.dependencies && p.sourceConfig.dependencies.length > 0) {
      for (const x of p.sourceConfig.dependencies) {
        if (typeof x === 'string') {
          const _p = map.get(x)!;
          if (!_p) {
            continue;
          }
          if (targets.has(x)) {
            continue;
          }
          this.resolveDependencies(_p, map, targets, moduleMap);
        }
      }
    }
    p.readAllProjectList().forEach((x) => {
      targets.set(x.projectConfig.name, x);
    });
  }
}
