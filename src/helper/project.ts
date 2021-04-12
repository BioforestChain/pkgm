import { cacheGetter, cleanAllGetterCache } from '@bfchain/util-decorator';
import { Inject, ModuleStroge, Resolvable, Resolve } from '@bfchain/util-dep-inject';
import { Config } from './config';
import { BFS_PROJECT_ARG } from './const';
import { Decoder } from './decoder';
import { Encoder } from './encoder';
import { EnvHelper } from './envHelper';
import { Namer } from './namer';
import { PathHelper } from './pathHelper';
import { Reader } from './reader';
import { Writer } from './writer';

@Resolvable()
export class BFSProject {
  static ARGS = {
    ROOT_PROJECT: BFS_PROJECT_ARG,
    PROJECT_DIRNAME: Symbol('projectDirname'),
    AUTO_INIT: Symbol('autoInit'),
    PARENT_PROJECT: Symbol('parentProject'),
  };
  static from(
    args: {
      autoInit?: boolean;
      projectDirname?: string;
      rootBfsProject?: BFSProject;
      parentBfsProject?: BFSProject;
    },
    moduleMap = new ModuleStroge()
  ) {
    const ARGS = BFSProject.ARGS;
    args.autoInit !== undefined && moduleMap.set(ARGS.AUTO_INIT, args.autoInit);
    args.projectDirname !== undefined && moduleMap.set(ARGS.PROJECT_DIRNAME, args.projectDirname);
    args.rootBfsProject !== undefined && moduleMap.set(ARGS.ROOT_PROJECT, args.rootBfsProject);
    args.parentBfsProject !== undefined &&
      moduleMap.set(ARGS.PARENT_PROJECT, args.parentBfsProject);

    return Resolve(BFSProject, moduleMap);
  }
  constructor(
    private path: PathHelper,
    @Inject(BFSProject.ARGS.PROJECT_DIRNAME, { optional: true })
    public readonly projectDirname = process.env.BFSP_ROOT_DIR || path.cwd,
    @Inject(BFSProject.ARGS.AUTO_INIT, { optional: true })
    public readonly autoInit = false,
    @Inject(BFSProject.ARGS.PARENT_PROJECT, { optional: true })
    public readonly parentBfsProject: BFSProject | undefined,
    @Inject(BFSProject.ARGS.ROOT_PROJECT, { optional: true })
    public readonly rootBfsProject: BFSProject | undefined,
    private decoder: Decoder,
    private encoder: Encoder,
    private namer: Namer,
    private reader: Reader,
    private writer: Writer,
    private config: Config,
    private moduleMap: ModuleStroge
  ) {}
  @cacheGetter
  private get envHelper() {
    if (this.rootBfsProject) {
      return Resolve(EnvHelper, this.moduleMap);
    }
    return EnvHelper.from({ bfsProject: this }, this.moduleMap);
  }

  get defaultVersion(): string {
    return (
      this.parentBfsProject?.projectConfig.version || this.rootBfsProject?.defaultVersion || '0.0.0'
    );
  }
  get parentProjectName() {
    return this.parentBfsProject?.projectConfig.name;
  }

  clearCache() {
    cleanAllGetterCache(this);
  }

  @cacheGetter
  get projectFilepath() {
    const filename = this.path.join(this.projectDirname, this.config.projectConfigFilename);
    if (!this.reader.exists(filename)) {
      if (this.autoInit) {
        this.writer.writeFile(filename, {});
      } else {
        throw new SyntaxError(
          `could not found '${this.config.projectConfigFilename}'. do init first.`
        );
      }
    }

    return filename;
  }
  @cacheGetter
  get projectDirpath() {
    const { projectFilepath } = this;
    return this.path.parse(projectFilepath).dir;
  }
  @cacheGetter
  get sourceConfig() {
    const { projectFilepath } = this;
    return this.encoder.encodeByFilepath<Partial<PKGM.Config.BfsProject>>(projectFilepath);
  }
  @cacheGetter
  get projectConfig() {
    const { sourceConfig, projectFilepath, projectDirpath } = this;

    let {
      name,
      shortName,
      version = this.defaultVersion,
      vars = {},
      /// 读取三个层级的配置：
      source,
      projects: references = [],
      dependencies = [],
      plugins,
    } = sourceConfig;
    // 如果项目名为空,或者已经有父级项目名,那么强制使用命名规则来统一名字
    if (!name || this.parentProjectName) {
      name = this.namer.nameProject(shortName || this.path.parse(projectDirpath).base, {
        parentProjectName: this.parentProjectName,
        vars: sourceConfig.vars,
      });
    }

    /// 去重
    references = [...new Set(references)];

    /// 处理source
    if (!source) {
      /// 如果有默认src文件夹,那么将source指向src
      try {
        if (this.reader.stat(this.path.join(this.projectDirpath, 'src')).isDirectory()) {
          if (references.length === 0) {
            source = { dirName: 'src', mainFilename: '' };
          }
        }
      } catch {}
    }
    if (source) {
      if (typeof source !== 'object') {
        source = { dirName: '', mainFilename: '' };
      }
      if (!source.mainFilename) {
        source.mainFilename = 'index.ts';
      }
      if (!source.dirName) {
        source.dirName = 'src';
      }
    }

    /// 处理 plugins
    if (!plugins?.bdkTsc) {
      plugins = Object.assign({}, plugins, {
        bdkTsc: { target: ['cjs', 'esm', 'esm-es5'] },
      });
    }

    const cleanConfig: PKGM.Config.BfsProject = {
      name,
      shortName,
      version,
      vars,
      source,
      projects: references,
      dependencies: dependencies,
      plugins,
    };

    /// 写回配置文件中
    this.writer.writeFile(
      projectFilepath,
      this.decoder.decodeByFilepath(projectFilepath, cleanConfig),
      true
    );

    /// 解析env
    const env = this.envHelper.getInnerEnv(cleanConfig, {
      PARENT_PROJECT_NAME: this.parentProjectName,
      ...this.prototypedVars,
    });
    this.envHelper.resolveWithEnv(cleanConfig, env);

    return cleanConfig;
  }

  @cacheGetter
  get prototypedVars(): PKGM.Config.ENVS {
    const { parentBfsProject } = this;
    const projectNames: PKGM.Config.ENVS = {};
    if (this.rootBfsProject) {
      projectNames.ROOT_PROJECT_NAME = this.rootBfsProject.projectConfig.name;
    }
    const allVars: PKGM.Config.ENVS = {};
    if (parentBfsProject) {
      const parentPrototypedVars = parentBfsProject.prototypedVars;
      projectNames.PARENT_PROJECT_NAME = parentBfsProject.projectConfig.name;
      for (const key in parentPrototypedVars) {
        if (key.startsWith('PARENT_PROJECT_NAME')) {
          const deep = 1 + (parseInt(key.replace('PARENT_PROJECT_NAME_', '')) || 0);
          projectNames['PARENT_PROJECT_NAME_' + deep] = parentPrototypedVars[key];
        }
      }
      Object.assign(allVars, parentPrototypedVars, this.sourceConfig.vars, projectNames);
    } else {
      Object.assign(allVars, this.sourceConfig.vars, projectNames);
    }

    return this.envHelper.resolveWithEnv(allVars, allVars);
  }

  @cacheGetter
  get rootProjectDirpath() {
    return this.rootBfsProject?.projectDirname || this.projectDirname;
  }

  @cacheGetter
  get rootShadownDirpath() {
    return this.path.join(this.rootProjectDirpath, this.config.projectShadowDirname);
  }

  @cacheGetter
  get rootPackageDirpath() {
    return this.path.join(this.rootShadownDirpath, this.config.shadownRootPackageDirname);
  }
  resolvePackageDirpath(name: string) {
    return this.path.join(this.rootPackageDirpath, name);
  }
  @cacheGetter
  get packageDirpath() {
    return this.resolvePackageDirpath(this.projectConfig.name);
  }
  /**
   * 读取当前项目所有相关源代码目录，递归!!
   * @TODO 支持自定义过滤
   */
  readAllTypedProjects() {
    const allProjectMap = this.readAllProjectList();
    const allTypedProjectMap = new Map<string, PKGM.Config.BfsTypedProject>();

    for (const [projectDirpath, project] of allProjectMap) {
      const { projectConfig: config } = project;
      if (config.source) {
        allTypedProjectMap.set(config.name, {
          type: 'source',
          name: config.name,
          projectDirpath,
          packageDirpath: this.resolvePackageDirpath(config.name),
          version: config.version,
          source: config.source,
          projects: config.projects,
          dependencies: config.dependencies,
        });
      } else {
        allTypedProjectMap.set(config.name, {
          type: 'multi',
          name: config.name,
          projectDirpath,
          packageDirpath: this.resolvePackageDirpath(config.name),
          version: config.version,
          projects: config.projects,
          dependencies: config.dependencies,
        });
      }
    }

    return allTypedProjectMap;
  }
  /**
   * 读取当前项目所有源代码目录，递归!!
   */
  readAllProjectList(projectCache = new Map<string, BFSProject>([[this.projectDirname, this]])) {
    /// 默认缓存当前项目
    if (!projectCache.has(this.projectDirname)) {
      projectCache.set(this.projectDirname, this);
    }

    const { projectConfig } = this;
    const mySubProjectList: BFSProject[] = [];
    /// 遍历出直属子项目
    for (const subPackage of projectConfig.projects) {
      const subPackageBaseDirname = this.path.join(this.projectDirname, subPackage);
      if (!projectCache.has(subPackageBaseDirname)) {
        const subProject = BFSProject.from(
          {
            autoInit: this.autoInit,
            projectDirname: subPackageBaseDirname,
            parentBfsProject: this,
            rootBfsProject: this.rootBfsProject || this,
          },
          new ModuleStroge([], this.moduleMap)
        );
        mySubProjectList.push(subProject);
        projectCache.set(subPackageBaseDirname, subProject);
      }
    }

    /// 直属子项目进行二次遍历, 递归模式!
    for (const mySubPackage of mySubProjectList) {
      mySubPackage.readAllProjectList(projectCache);
    }
    return projectCache;
  }
  private _nameToMatcher(name: string) {
    if (name.includes('*')) {
      const reg = RegExp(name.replace('*', '.*?'));
      return (sname: string) => {
        // sname.
        return reg.test(sname);
      };
    }
    return (sname: string) => sname === name;
  }
  findScript(name: string) {
    const nameMatcher = this._nameToMatcher(name);
    const allProjectMap = this.readAllProjectList();
    const findScriptList: {
      script: PKGM.Config.BfsProject.Plugins.Script;
      project: BFSProject;
    }[] = [];
    for (const project of allProjectMap.values()) {
      const scripts = project.projectConfig.plugins?.scripts;
      if (scripts) {
        for (const script of scripts) {
          if (nameMatcher(script.name)) {
            findScriptList.push({ script, project });
          }
        }
      }
    }
    return findScriptList;
  }
}
