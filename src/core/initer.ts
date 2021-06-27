import './@types';
import { Inject, ModuleStroge, Injectable, Resolve, Resolvable } from '@bfchain/util-dep-inject';
import { bindThis } from '@bfchain/util-decorator';
import { Reader } from '../helper/reader';
import { Config } from '../helper/config';
import { Encoder } from '../helper/encoder';
import { Namer } from '../helper/namer';
import { Writer } from '../helper/writer';
import { Decoder } from '../helper/decoder';
import { PathHelper } from '../helper/pathHelper';
import * as tsconfigBase from '../assets/tsconfig.base';
import * as execa from 'execa';
import { yarnRc } from '../assets/yarnrc';
import { prettierRc } from '../assets/prettierrc';
// import * as scripts from "../assets/scripts";
import * as vscode from '../assets/vscode';
import { BFSProject } from '../helper/project';
import { BFS_PROJECT_ARG } from '../helper/const';
import { AssetsHelper } from '../helper/assetsHelper';
import { ConsolePro } from 'console-pro';
import semver from 'semver';
import validate from 'validate-npm-package-name';
import { Logger } from '../helper/logger';

/**
 * 初始者，根据配置文件对整个项目进行初始生成
 */
@Injectable()
export class Initer {
  static ARGS = {
    BFS_PROJECT: BFS_PROJECT_ARG,
  };
  static from(args: { bfsProject: BFSProject }, moduleMap = new ModuleStroge()) {
    moduleMap.set(Initer.ARGS.BFS_PROJECT, args.bfsProject);
    return Resolve(Initer, moduleMap);
  }
  constructor(
    @Inject(Initer.ARGS.BFS_PROJECT)
    public readonly bfsProject: BFSProject,
    private reader: Reader,
    private writer: Writer,
    private config: Config,
    private encoder: Encoder,
    private decoder: Decoder,
    private path: PathHelper,
    private assets: AssetsHelper,
    private logger: Logger,
    private namer: Namer
  ) {}

  getShadowDirname() {
    return this.path.join(this.bfsProject.projectDirpath, this.config.projectShadowDirname);
  }
  /**
   * 初始化影子目录
   * @param dirname
   * @param options
   */
  initShadowDir(options: { ignoreInGit?: boolean }) {
    const { bfsProject } = this;
    const { projectShadowDirname } = this.config;
    const shadowDirname = this.getShadowDirname();
    this.writer.makeDir(shadowDirname);
    /// 写入到gitignore中
    if (options.ignoreInGit) {
      const gitIgnoreFilepath = this.path.join(bfsProject.projectDirpath, '.gitignore');
      const gitIgnoreContent = this.reader.exists(gitIgnoreFilepath)
        ? this.reader.readFile(gitIgnoreFilepath, 'utf-8')
        : '';
      let newGitIgnoreContent = gitIgnoreContent.trim();

      const gitIgnoreLines = new Set(gitIgnoreContent.split('\n').map((line) => line.trim()));
      if (!gitIgnoreLines.has(projectShadowDirname)) {
        newGitIgnoreContent += '\n' + projectShadowDirname;
      }
      if (!gitIgnoreLines.has('node_modules')) {
        newGitIgnoreContent += '\nnode_modules';
      }

      if (newGitIgnoreContent !== gitIgnoreContent) {
        this.writer.writeFile(gitIgnoreFilepath, newGitIgnoreContent.trim());
      }
    }
    return shadowDirname;
  }

  /**
   * 在影子目录中构建项目目录
   */
  initShadownProjects(
    rootConfig: PKGM.Config.BfsProject,
    shadowDirname: string,
    typedProjects: PKGM.Config.TypedProjectMap,
    opts: { skipWrite?: boolean } = {}
  ) {
    const optsDoWrite = !opts.skipWrite;
    /// 导入源码
    const mixProjectInfoList: PKGM.Config.BfsMixProjectInfo[] = [];
    // const taskMap = new Map<string, { task: Promise<void>; waiting: Set<string> }>();
    for (const typedProject of typedProjects.values()) {
      /// 创建源码的影子文件夹
      const packageDir = typedProject.packageDirpath;
      optsDoWrite && this.writer.makeDir(packageDir);
      /// 初始化 项目配置
      const bfsProjectFilepath = this.path.join(
        typedProject.projectDirpath,
        this.config.projectConfigFilename
      );
      const bfsProjectContent: Partial<PKGM.Config.BfsProject> = this.reader.exists(
        bfsProjectFilepath
      )
        ? this.encoder.encodeByFilepath(bfsProjectFilepath)
        : {};
      bfsProjectContent.name = typedProject.name;
      bfsProjectContent.version = typedProject.version;
      bfsProjectContent.vars || (bfsProjectContent.vars = {});
      bfsProjectContent.projects || (bfsProjectContent.projects = []);
      bfsProjectContent.dependencies = typedProject.dependencies;
      const plugins = bfsProjectContent.plugins || (bfsProjectContent.plugins = {});
      /* const bdkTsc = */
      plugins.bdkTsc ||
        (plugins.bdkTsc = rootConfig.plugins?.bdkTsc || {
          target: ['cjs', 'esm', 'esm-es6', 'esm-es5'],
        });

      let packageSrcDir = '';
      if (typedProject.type === 'source') {
        /// 初始化源码
        const projectSrcDir = this.path.join(
          typedProject.projectDirpath,
          typedProject.source.dirName
        );
        const projectSrcMainFilepath = this.path.join(
          projectSrcDir,
          typedProject.source.mainFilename
        );
        packageSrcDir = this.path.join(packageDir, this.config.shadownProjectSourceDirname);
        if (optsDoWrite) {
          this.writer.shallowClone(projectSrcDir, packageSrcDir);

          if (!this.reader.exists(projectSrcMainFilepath)) {
            this.writer.writeFile(projectSrcMainFilepath, '');
          }
        }

        bfsProjectContent.source = typedProject.source;
      }

      const writeBfsProject = (content = bfsProjectContent) => {
        optsDoWrite && this.writer.writeFile(bfsProjectFilepath, content, true);
      };
      // 先进行一波写入
      writeBfsProject();

      mixProjectInfoList.push({
        packageDir,
        packageSrcDir,
        bfs: bfsProjectContent as PKGM.Config.BfsProject,
        typed: typedProject,
        refs: new Set(),
        writeBfsProject,
      });
      // taskMap.set(project.name, {
      //   task: (async () => {
      //     await Promise.resolve();

      //   })(),
      //   waiting: new Set(),
      // });
    }

    /// 梳理依赖,提取优先级, 找出循环依赖

    const dirMap = new Map<string, PKGM.Config.BfsMixProjectInfo>(
      mixProjectInfoList.map((p) => [p.typed.projectDirpath, p])
    );
    const nameMap = new Map<string, PKGM.Config.BfsMixProjectInfo>(
      mixProjectInfoList.map((p) => [p.bfs.name, p])
    );

    const topSet = new Set<PKGM.Config.BfsMixProjectInfo>(mixProjectInfoList);
    for (const mixProjectInfo of mixProjectInfoList) {
      /// 目前只支持path模式,不支持直接使用name
      for (const subProject of mixProjectInfo.bfs.projects) {
        const refPath =
          typeof subProject === 'string'
            ? subProject
            : subProject instanceof Array
            ? subProject[0]
            : subProject.name;
        const ref_mixProjectInfo = dirMap.get(
          this.path.join(mixProjectInfo.typed.projectDirpath, refPath)
        );
        if (!ref_mixProjectInfo) {
          throw new ReferenceError(
            `project '${mixProjectInfo.typed.name}(${mixProjectInfo.typed.projectDirpath})' no found reference: '${refPath}'`
          );
        }
        mixProjectInfo.refs.add(ref_mixProjectInfo);
        topSet.delete(ref_mixProjectInfo);
      }
    }

    return {
      projectInfoList: mixProjectInfoList,
      topMixProjectInfoSet: topSet,
      dirMixProjectInfoMap: dirMap,
      nameMixProjectInfoMap: nameMap,
    };
  }
  initShadownConfigs(
    rootConfig: PKGM.Config.BfsProject,
    shadowDirname: string,
    mixProjectInfoList: PKGM.Config.BfsMixProjectInfo[],
    projectDirpath: string
  ) {
    /**
     * @TODO 插件化
     * 初始化 learn, package.json 等
     */
    const workspaces = mixProjectInfoList.map(
      (mp) => `${this.config.shadownRootPackageDirname}/${mp.bfs.name}`
    );

    /// learn.json
    const learnFilepath = this.path.join(shadowDirname, 'learn.json');
    const learnConfig: Partial<PKGM.Config.Learn> = this.reader.exists(learnFilepath)
      ? this.encoder.encodeByFilepath(learnFilepath)
      : {};
    if (!learnConfig.version) {
      learnConfig.version = rootConfig.version;
    }
    learnConfig.packages = workspaces;
    this.writer.writeFile(learnFilepath, learnConfig);
    /// package.json
    const packageFilepath = this.path.join(shadowDirname, 'package.json');
    const packageConfig: Partial<PKGM.Config.Package> = this.reader.exists(packageFilepath)
      ? this.encoder.encodeByFilepath(packageFilepath)
      : {};
    packageConfig.name = rootConfig.name;
    packageConfig.version = 'mono';
    packageConfig.private = true;
    packageConfig.workspaces = workspaces;
    packageConfig.scripts = Object.assign({}, packageConfig.scripts, {
      up: 'yarn upgrade-interactive',
      upi: 'yarn upgrade-interactive --latest',
      publ: 'lerna publish',
      'publ:force': 'lerna publish --force-publish',
      dev: 'bdk-tsc --build -w',
      'dev:all': 'bdk-tsc --build -w ./tsconfig.all.json',
      clean: 'node ./scripts/rmBuild.js',
    });
    packageConfig.devDependencies = Object.assign({}, packageConfig.devDependencies, {
      '@bfchain/devkit': 'latest',
      learn: 'latest',
      [rootConfig.pm.name]: rootConfig.pm.version,
      '@bfchain/devkit-tsc': 'latest',
    });
    this.writer.writeFile(packageFilepath, packageConfig);
    /// rc file
    this.writer.writeFile(this.path.join(shadowDirname, '.yarnrc'), yarnRc);
    this.writer.writeFile(
      this.path.join(shadowDirname, '.prettierrc'),
      this.decoder.decodeJSON5(prettierRc)
    );
    // /// scripts
    // this.writer.writeFile(
    //   this.path.join(shadowDirname, "scripts/rmBuild.js"),
    //   scripts.rmBuild
    // );

    /**
     * @TODO 插件化
     * 初始化 tsconfig.json 等
     */
    {
      /// tsconfig.target.json
      const bdkTscConfig = rootConfig.plugins?.bdkTsc;
      const tsTarget = new Set(bdkTscConfig?.target);

      const allTsconfigFilenameList: string[] = [];
      for (const target of tsTarget) {
        const tsconfigFilename = `tsconfig.${target}.json`;
        allTsconfigFilenameList.push(tsconfigFilename);
        const tsconfigFilepath = this.path.join(shadowDirname, tsconfigFilename);
        const tsconfigConfig: Partial<PKGM.Config.TsConfig> = this.reader.exists(tsconfigFilepath)
          ? this.encoder.encodeByFilepath(tsconfigFilepath)
          : {};
        tsconfigConfig.files || (tsconfigConfig.files = []);
        tsconfigConfig.include || (tsconfigConfig.include = []);
        /// 写入子包
        tsconfigConfig.references = [];
        /// 寻找出没有被引用过的项目，作为顶级存在
        const refedProjects = new Set<PKGM.Config.BfsMixProjectInfo>(mixProjectInfoList);
        for (const mp of mixProjectInfoList) {
          for (const cmp of mp.refs) {
            refedProjects.delete(cmp);
          }
        }
        for (const mp of refedProjects) {
          const configFilefrag = `${this.config.shadownRootPackageDirname}/${mp.bfs.name}/${tsconfigFilename}`;
          /// 把相子项目的模块都给导出来编译
          if (this.reader.exists(this.path.join(shadowDirname, configFilefrag))) {
            tsconfigConfig.references.push({ path: configFilefrag });
          }
        }
        this.writer.writeFile(tsconfigFilepath, tsconfigConfig);
      }
      /// 默认提供 tsconfig
      {
        const tsconfigFilepath = this.path.join(shadowDirname, 'tsconfig.json');
        let tsconfigConfig: PKGM.Config.TsConfig | undefined;
        if (allTsconfigFilenameList.length) {
          tsconfigConfig = {
            files: [],
            include: [],
            references: allTsconfigFilenameList
              .slice(0, 2)
              .map((filename) => ({ path: `./${filename}` })),
          };
        }
        this.writer.writeOrDeleteFile(tsconfigFilepath, tsconfigConfig);
      }
      /// 默认提供 tsconfig.all
      {
        const tsconfigFilename = this.path.join(shadowDirname, 'tsconfig.all.json');
        let tsconfigConfig: PKGM.Config.TsConfig | undefined;
        if (allTsconfigFilenameList.length) {
          tsconfigConfig = {
            files: [],
            include: [],
            references: allTsconfigFilenameList.map((filename) => ({
              path: `./${filename}`,
            })),
          };
        }
        this.writer.writeOrDeleteFile(tsconfigFilename, tsconfigConfig);
      }
    }
    /**
     * @TODO 插件化
     * 初始化 .vscode 文件夹内的配置文件
     */
    {
      const settingsFilepath = this.path.join(projectDirpath, '.vscode/settings.json');
      const settingsConfig = this.reader.exists(settingsFilepath)
        ? this.encoder.encodeByFilepath(settingsFilepath)
        : {};
      Object.assign(settingsConfig, vscode.settings(this.config));
      this.writer.writeFile(settingsFilepath, settingsConfig);
    }
  }

  private _refDeepMap = new Map<PKGM.Config.BfsMixProjectInfo, number>();
  @bindThis
  private _getTsRefsDeep(
    ref: PKGM.Config.BfsMixProjectInfo,
    allMixInfoMap: Map<string, PKGM.Config.BfsMixProjectInfo>,
    _stack = new Set<PKGM.Config.BfsMixProjectInfo>()
  ): number {
    if (_stack.has(ref)) {
      const stackList = [..._stack];
      const loopStackList = stackList.slice(stackList.indexOf(ref));
      throw new SyntaxError(
        '发现循环依赖: ' + loopStackList.map((ref) => ref.bfs.name).join(' => ')
      );
    }
    _stack.add(ref);

    let deep = this._refDeepMap.get(ref);
    if (deep === undefined) {
      const refs = this._getAllTsRefs(ref, allMixInfoMap);
      deep =
        refs.length > 0
          ? Math.max(
              ...Array.from(refs, (ref) => this._getTsRefsDeep(ref, allMixInfoMap, _stack))
            ) + 1
          : 0;
      this._refDeepMap.set(ref, deep);
    }

    _stack.delete(ref);
    return deep;
  }
  private _projectRefsMap = new Map<
    PKGM.Config.BfsMixProjectInfo,
    Set<PKGM.Config.BfsMixProjectInfo>
  >();
  private _getAllTsRefs(
    project: PKGM.Config.BfsMixProjectInfo,
    allMixInfoMap: Map<string, PKGM.Config.BfsMixProjectInfo>
  ) {
    let allTsReferences = this._projectRefsMap.get(project);
    if (allTsReferences === undefined) {
      allTsReferences = new Set(project.refs);
      this._projectRefsMap.set(project, allTsReferences);
      for (const dep of project.typed.dependencies) {
        const depInfo = typeof dep === 'string' && allMixInfoMap.get(dep);
        if (depInfo) {
          if (allTsReferences.has(depInfo) === false) {
            allTsReferences.add(depInfo);
          } else {
            this.logger.warn(
              `${project.bfs.name}的配置文件bfsp.json中"projects"和"dependencies"字段同时包含了${depInfo.bfs.name}包`
            );
          }
        }
      }
    }
    return [...allTsReferences];
  }
  private _clearTsRefInfoCache() {
    this._refDeepMap.clear();
  }

  async initShadownProjectConfigs(
    rootConfig: PKGM.Config.BfsProject,
    shadowDirname: string,
    mixInfo: PKGM.Config.BfsMixProjectInfo,
    allMixInfoMap: Map<string, PKGM.Config.BfsMixProjectInfo>,
    inited = new WeakSet<PKGM.Config.BfsTypedProject>()
  ) {
    const {
      typed: typedProject,
      bfs: bfsProject,
      packageDir,
      packageSrcDir,
      refs,
      writeBfsProject,
    } = mixInfo;
    if (inited.has(typedProject)) {
      return;
    }
    inited.add(typedProject);

    /// 先初始化子模块
    const allTsRefs = this._getAllTsRefs(mixInfo, allMixInfoMap);
    for (const ref of allTsRefs) {
      await this.initShadownProjectConfigs(rootConfig, shadowDirname, ref, allMixInfoMap, inited);
    }
    /**
     * 初始化  tsconfig.json
     * @TODO 插件化
     */
    {
      /// package.json
      const packageFilepath = this.path.join(packageDir, 'package.json');
      const packageConfig: Partial<PKGM.Config.Package> = this.reader.exists(packageFilepath)
        ? this.encoder.encodeByFilepath(packageFilepath)
        : {};
      packageConfig.name = typedProject.name;
      packageConfig.version || (packageConfig.version = rootConfig.version);
      if (typedProject.type === 'source') {
        const mainFilenameN = this.path.parse(typedProject.source.mainFilename).name;
        packageConfig.main = `cjs/${mainFilenameN}.js`;
        packageConfig.type = `cjs/${mainFilenameN}.d.ts`;
        packageConfig.module = `esm/${mainFilenameN}.js`;
        packageConfig.files = [...(bfsProject.plugins?.bdkTsc?.target || ['cjs', 'esm'])]; // ['build'];
      } else {
        delete packageConfig.main;
        delete packageConfig.type;
        delete packageConfig.module;
        packageConfig.files = [];
      }
      packageConfig.dependencies = {}; // Object.assign({}, singleProject.dependencies);
      for (const ref of refs) {
        packageConfig.dependencies[ref.typed.name] = ref.typed.version;
      }
      for (const dep of typedProject.dependencies) {
        const depInfo = typeof dep === 'string' && allMixInfoMap.get(dep);
        if (depInfo) {
          packageConfig.dependencies[depInfo.bfs.name] = depInfo.bfs.version;
        } else {
          let name: string;
          let version: string;
          if (typeof dep === 'string') {
            const lastAtIndex = dep.lastIndexOf('@');
            if (lastAtIndex > 0) {
              name = dep.slice(0, lastAtIndex);
              version = dep.slice(lastAtIndex + 1) || '*';
            } else {
              [name, version = '*'] = dep.split(':');
            }
          } else if (Array.isArray(dep)) {
            [name, version = '*'] = dep;
          } else {
            name = dep.name;
            version = dep.version || '*';
          }

          const nameValidateRes = validate(name);
          if (nameValidateRes.validForNewPackages === false) {
            throw new SyntaxError(
              `invalid dependence name(${name}) ${JSON.stringify(dep)} in ${typedProject.name}\n` +
                nameValidateRes.errors.join('\n')
            );
          }

          if (semver.valid(version) === null && semver.validRange(version) === null) {
            throw new SyntaxError(
              `invalid dependence version(${version}) ${JSON.stringify(dep)} in ${
                typedProject.name
              }`
            );
          }

          packageConfig.dependencies[name] = version;
        }
      }
      if (bfsProject.plugins?.npmPackage) {
        const { npmPackage } = bfsProject.plugins;
        Object.assign(packageConfig, npmPackage);
      }

      this.writer.writeFile(packageFilepath, packageConfig, true);
    }
    /**
     * 初始化  tsconfig.json
     * @TODO 插件化
     */
    {
      const tsTargets = new Set(bfsProject.plugins?.bdkTsc?.target || []);

      /// 移除已有的却已经不在target中的 tsconfig.target 和它的输出文件夹
      const exitsTsconfigFilenameList = this.reader.lsFiles(
        packageDir,
        (filename) =>
          filename !== 'tsconfig.json' &&
          filename.startsWith('tsconfig.') &&
          filename.endsWith('.json')
      );
      for (const exitsTsconfigFilename of exitsTsconfigFilenameList) {
        const target = exitsTsconfigFilename.split(
          '.',
          2
        )[1] as PKGM.Config.BfsProject.Plugins.BdkTsc.Target;
        if (tsTargets.has(target)) {
          continue;
        }
        this.writer.deleteAll(this.path.join(packageDir, target));
        this.writer.deleteAll(this.path.join(packageDir, exitsTsconfigFilename));
        this.writer.deleteAll(
          this.path.join(packageDir, exitsTsconfigFilename.slice(0, -4) + 'tsbuildinfo')
        );
      }

      /// tsconfig.{target}.json
      const allTsconfigFilenameList: string[] = [];
      for (const target of tsTargets) {
        const tsconfigFilename = `tsconfig.${target}.json`;
        allTsconfigFilenameList.push(tsconfigFilename);
        const tsconfigFilepath = this.path.join(packageDir, tsconfigFilename);
        let tsconfigConfig: Partial<PKGM.Config.TsConfig>;
        let tsCompilerOptions: Required<PKGM.Config.TsConfig>['compilerOptions'];

        if (typedProject.type === 'source') {
          tsconfigConfig = this.reader.exists(tsconfigFilepath)
            ? this.encoder.encodeByFilepath(tsconfigFilepath)
            : {};

          Object.assign(tsconfigConfig, tsconfigBase.getTsconfigBase(target));
          tsCompilerOptions = tsconfigConfig['compilerOptions']!;

          tsconfigConfig.files = await this.reader.lsAllFiles(
            packageSrcDir,
            (filename) =>
              (filename.endsWith('.ts') || filename.endsWith('.tsx')) &&
              /**
               * @TODO use .gitignore or custom ignore
               */
              !filename.startsWith('.')
          );
          tsconfigConfig.files = tsconfigConfig.files.map(
            (file) => `${this.config.shadownProjectSourceDirname}/${file}`
          );
          tsconfigConfig.include || (tsconfigConfig.include = []);

          /// 写入编译配置项
          Object.assign(tsCompilerOptions, {
            outDir: `./${target}`,
            rootDir: `./${this.config.shadownProjectSourceDirname}`,
          });
        } else {
          tsconfigConfig = {
            compilerOptions: { composite: true },
            files: [],
            include: [],
          };
          tsCompilerOptions = tsconfigConfig.compilerOptions!;
        }
        /// 写入子包
        tsconfigConfig.references = [];
        for (const ref of allTsRefs) {
          const refTsconfigFilepath = this.path.join(ref.packageDir, tsconfigFilename);
          if (this.reader.exists(refTsconfigFilepath)) {
            tsconfigConfig.references.push({
              path: this.path.relative(mixInfo.packageDir, refTsconfigFilepath),
            });
          }
        }

        /// lib和types
        const tsRuntime = bfsProject.plugins?.bdkTsc?.tsRuntime;
        if (tsRuntime) {
          const libs = new Set(tsCompilerOptions.lib);
          const types = new Set(tsCompilerOptions.types);
          for (const jsr of tsRuntime) {
            if (jsr === 'node' || jsr === 'nodeworker') {
              types.add('node');
            } else if (jsr === 'web') {
              libs.add('dom');
              libs.add('dom.iterable');
            } else if (jsr === 'webworker') {
              libs.add('webworker');
              libs.add('webworker.importscripts');
              libs.add('webworker.iterable');
            } else {
              types.add(jsr);
            }
          }
          tsCompilerOptions.lib = [...libs];
          tsCompilerOptions.types = [...types];
        }

        this.writer.writeFile(tsconfigFilepath, tsconfigConfig, true);
      }
      /// 默认提供 tsconfig
      {
        const tsconfigFilepath = this.path.join(packageDir, 'tsconfig.json');
        let tsconfigConfig: PKGM.Config.TsConfig | undefined;
        if (allTsconfigFilenameList.length) {
          tsconfigConfig = {
            files: [],
            include: [],
            references: [{ path: `./${allTsconfigFilenameList[0]}` }],
          };
        }
        this.writer.writeOrDeleteFile(tsconfigFilepath, tsconfigConfig);
      }
    }
    /**
     * 拷贝静态资源 assets
     * @TODO 插件化
     */
    {
      const assets = bfsProject.plugins?.assets;
      if (assets) {
        this.assets.doClone(assets, typedProject.projectDirpath, packageDir);
      }
    }
    /**
     * 验证rollup的入口是否在source中
     */
    {
      const rollup = bfsProject.plugins?.rollup;
      const rollupList = rollup ? (rollup instanceof Array ? rollup : [rollup]) : [];
      for (const rollup of rollupList) {
        const source = bfsProject.source;
        if (!source) {
          throw new Error("rollup plugin need config 'source' first");
        }
        let needUpdate = !rollup.sourceInputFile;
        if (needUpdate) {
          rollup.sourceInputFile = source.mainFilename;
        }
        const { sourceInputFile } = rollup;
        const isTsFile = sourceInputFile.endsWith('.ts') || sourceInputFile.endsWith('.tsx');
        if (!isTsFile) {
          throw new Error('rollup plugin sourceInputFile shold be an typescript file.');
        }
        const isFile = this.reader.isFile(
          this.path.join(typedProject.projectDirpath, source.dirName, sourceInputFile)
        );
        if (!isFile) {
          throw new Error('rollup plugin sourceInputFile not an file.');
        }

        if (needUpdate) {
          writeBfsProject();
        }
      }
    }
  }
  async linkDependencies(shadowDirname: string) {
    execa.commandSync('yarn install', {
      cwd: shadowDirname,
      stdio: 'inherit',
    });
    this.writer.shallowClone(
      this.path.join(shadowDirname, 'node_modules'),
      this.path.join(this.bfsProject.projectDirpath, 'node_modules')
    );
  }
  async reLink() {
    this.bfsProject.clearCache();
    const { projectConfig } = this.bfsProject;
    const shadowDirname = this.getShadowDirname();
    const typedProjects = this.bfsProject.readAllTypedProjects();

    /// 在影子目录中构建项目目录
    const shadowProjects = this.initShadownProjects(projectConfig, shadowDirname, typedProjects);

    /// 清理缓存
    this._clearTsRefInfoCache();
    /// 使用通用规则初始化配置文件
    const _inited = new WeakSet<PKGM.Config.BfsTypedProject>();
    for (const mixProjectInfo of shadowProjects.projectInfoList) {
      await this.initShadownProjectConfigs(
        projectConfig,
        shadowDirname,
        mixProjectInfo,
        shadowProjects.nameMixProjectInfoMap,
        _inited
      );
    }

    /// 初始化根项目配置
    this.initShadownConfigs(
      projectConfig,
      shadowDirname,
      shadowProjects.projectInfoList,
      this.bfsProject.projectDirpath
    );
    /// 链接依赖项
    await this.linkDependencies(shadowDirname);
  }

  private _console?: ConsolePro;
  private _getConsole() {
    return (this._console ||= new ConsolePro());
  }
  /**
   * 检查import和声明的依赖是否匹配
   */
  async checkImport(filter: { unuse: boolean; miss: boolean; warn: boolean }) {
    const console = this._getConsole();
    const { projectConfig } = this.bfsProject;
    const shadowDirname = this.getShadowDirname();
    const typedProjects = this.bfsProject.readAllTypedProjects();

    /// 在影子目录中构建项目目录
    const shadowProjects = this.initShadownProjects(projectConfig, shadowDirname, typedProjects);
    const allMixInfoMap = shadowProjects.nameMixProjectInfoMap;
    let hasError = false;
    for (const project of shadowProjects.projectInfoList.sort(
      /// 这里的排序，是吧短路径的放在后面。开发者优先修复后面的，可以更快地正确修复问题
      (a, b) => this._getTsRefsDeep(b, allMixInfoMap) - this._getTsRefsDeep(a, allMixInfoMap)
    )) {
      const { typed: typedProject } = project;
      if (typedProject.type !== 'source') {
        continue;
      }

      console.line('checking import:', typedProject.name);

      const projectSourceDirpath =
        this.path.join(typedProject.projectDirpath, typedProject.source.dirName) + this.path.sep;
      const mainFilepath = this.path.join(projectSourceDirpath, typedProject.source.mainFilename);
      /**同域项目的依赖 */
      const projectImports = new Map<string, Set<string>>();
      /**npm的依赖 */
      const npmImports = new Map<string, Set<string>>();
      /**越界的import */
      const warnImports = new Map<string, Set<string>>();
      const _addToImports = (
        imports: typeof projectImports,
        importFrom: string,
        tsFilepath: string,
        line: number
      ) => {
        let fromFiles = imports.get(importFrom);
        if (fromFiles === undefined) {
          fromFiles = new Set();
          imports.set(importFrom, fromFiles);
        }
        fromFiles.add(tsFilepath + ':' + line);
      };
      /**遍历过的文件 */
      const walkedFiles = new Set();
      const getProjectImport = (tsFilepath: string) => {
        if (walkedFiles.has(tsFilepath)) {
          return;
        }
        walkedFiles.add(tsFilepath);
        let canLog = false;
        // if (tsFilepath.includes('channel\\typings')) {
        //   debugger;
        //   canLog = true;
        // }

        const tsContent = this.reader.readFile(tsFilepath, 'utf8'); //
        /// 使用正则匹配
        let filterContent = tsContent;
        // 1. 消除单行注释
        filterContent = filterContent.replace(/\/\/[^\n]+/g, '');
        // 2. 消除多行注释
        filterContent = filterContent.replace(/\/\*[\w\W]+?\*\//g, '');
        // 3. 剔除字符串并进行缓存
        const holderStrCache = new Map<string, string>();
        let holder_id_acc = 0;
        filterContent = filterContent.replace(
          /"(?:\.|\\\"|[^\""\n])*"|'(?:\.|\\\'|[^\''\n])*'|`(?:\.|\\\`|[^\``])*`/g,
          (fullStr, dqs, sqs, tqs) => {
            const HOLDER_ID = `#_HOLDER_${holder_id_acc++}_#`;
            holderStrCache.set(HOLDER_ID, fullStr);
            return HOLDER_ID;
          }
        );
        // 4. 针对性地进行格式化，为后文匹配 正确过滤`.import`写法做铺垫
        filterContent = filterContent.replace(/\.\s+/g, '');

        const subProjectNamePrefix = this.namer.getNamePrefix(this.bfsProject.projectConfig.name);
        // 4. 解析静态import语法
        const syntaxer = (_full: string, HOLDER_ID: string) => {
          const importFromFull = holderStrCache.get(HOLDER_ID);
          if (!importFromFull) {
            throw new SyntaxError();
          }
          canLog && console.info(HOLDER_ID, _full.replace(HOLDER_ID, importFromFull));

          const line = filterContent.slice(0, filterContent.indexOf(HOLDER_ID)).split('\n').length;
          const importFrom = importFromFull.slice(1, -1);
          if (importFrom.startsWith('.')) {
            let depTsFilePath = this.path.resolve(
              this.path.parse(tsFilepath).dir,
              importFrom.endsWith('.ts')
                ? importFrom
                : importFrom.endsWith('/')
                ? importFrom + '/index.ts'
                : importFrom + '.ts'
            );

            if (
              this.reader.exists(depTsFilePath) &&
              this.reader.stat(depTsFilePath).isDirectory()
            ) {
              depTsFilePath = this.path.join(depTsFilePath, 'index.ts');
            }

            if (this.reader.exists(depTsFilePath) === false) {
              /// no found. ignore
              return '#_NO_FROUND_#' + HOLDER_ID;
            }

            /// 如果是同源的，继续遍历
            if (depTsFilePath.startsWith(projectSourceDirpath)) {
              getProjectImport(depTsFilePath);
            } else {
              /// 否则警告
              _addToImports(warnImports, importFrom, tsFilepath, line);
            }
          } else if (importFrom.startsWith(subProjectNamePrefix)) {
            _addToImports(projectImports, importFrom, tsFilepath, line);
          } else {
            // 其它的都是来自npm
            _addToImports(npmImports, importFrom, tsFilepath, line);
          }
          // @TODO 支持使用+ 来指向兄弟项目
          return HOLDER_ID;
        };
        const g = canLog && console.lgroup(tsFilepath);
        filterContent = filterContent.replace(
          /^import\s+[\w\W]*?(\s+from\s+)?(\#\_HOLDER\_\d+\_\#)/g,
          (_full, _hasFrom, HOLDER_ID) => syntaxer(_full, HOLDER_ID)
        );
        filterContent = filterContent.replace(
          /[\W]import\s+[\w\W]*?(\s+from\s+)?(\#\_HOLDER\_\d+\_\#)/g,
          (_full, _hasFrom, HOLDER_ID) => (_full[0] === '.' ? _full : syntaxer(_full, HOLDER_ID))
        );
        filterContent = filterContent.replace(
          /^import[\s\n]*?\([\s\n]*?(\#\_HOLDER\_\d+\_\#)[\s\n]*?\)/g,
          (_full, HOLDER_ID) => syntaxer(_full, HOLDER_ID)
        );
        filterContent = filterContent.replace(
          /[\W]import[\s\n]*?\([\s\n]*?(\#\_HOLDER\_\d+\_\#)[\s\n]*?\)/g,
          (_full, HOLDER_ID) => (_full[0] === '.' ? _full : syntaxer(_full, HOLDER_ID))
        );
        filterContent = filterContent.replace(
          /^export\s+(\{[\w\W]+?\}|\*)\s+from\s+(\#\_HOLDER\_\d+\_\#)/g,
          (_full, _exports, HOLDER_ID) => syntaxer(_full, HOLDER_ID)
        );
        filterContent = filterContent.replace(
          /[\W]export\s+(\{[\w\W]+?\}|\*)\s+from\s+(\#\_HOLDER\_\d+\_\#)/g,
          (_full, _exports, HOLDER_ID) => (_full[0] === '.' ? _full : syntaxer(_full, HOLDER_ID))
        );
        g && console.lgroupEnd(g);
      };
      getProjectImport(mainFilepath);

      //#region 最后尝试打印日志
      let g: symbol | undefined;
      const lgroupStart = () => g || (g = console.lgroup(typedProject.name));
      const lgroupEnd = () => {
        if (g !== undefined) {
          hasError = true;
          console.lgroupEnd(g);
        }
      };
      /// 越界警告
      if (warnImports.size !== 0 && filter.warn) {
        lgroupStart();
        const g = console.lgroup('以不规范的形式导入了依赖：');
        for (const [importFrom, fromFiles] of warnImports) {
          console.warn(importFrom);
          for (const file of fromFiles) {
            console.log('\t', console.flagHead('at', false), this.path.relativeCwd(file));
          }
        }
        console.warn([...warnImports].join('\n'));
        console.lgroupEnd(g);
      }
      /// 同域项目依赖缺失或者多余的警告
      const allTsRefList = this._getAllTsRefs(project, allMixInfoMap);
      // 递归获取所有的项目名词，用于检查import是否能正确工作
      const recAllRefedProjectNames = new Set();
      const recAddProjectNames = (projectInfo: PKGM.Config.BfsMixProjectInfo) => {
        if (recAllRefedProjectNames.has(projectInfo.bfs.name)) {
          return;
        }
        recAllRefedProjectNames.add(projectInfo.bfs.name);
        for (const refProjectInfo of this._getAllTsRefs(projectInfo, allMixInfoMap)) {
          recAddProjectNames(refProjectInfo);
        }
      };
      recAddProjectNames(project);

      const unuseRefs = new Set(allTsRefList.map((ref) => ref.bfs.name));
      const missRefImportList = [...projectImports].filter((projectImport) => {
        unuseRefs.delete(projectImport[0]);
        return !recAllRefedProjectNames.has(projectImport[0]);
      });
      if (unuseRefs.size !== 0 && filter.unuse) {
        lgroupStart();
        const g = console.lgroup('未使用的依赖：');
        for (const name of unuseRefs) {
          console.log(name);
        }
        console.lgroupEnd(g);
      }
      if (missRefImportList.length !== 0 && filter.miss) {
        lgroupStart();
        const g = console.lgroup('未声明的依赖：');
        for (const [importFrom, fromFiles] of missRefImportList) {
          console.warn(importFrom);
          for (const file of fromFiles) {
            console.log('\t', console.flagHead('at', false), this.path.relativeCwd(file));
          }
        }
        console.lgroupEnd(g);
      }
      /// @TODO 支持npm依赖的推理
      lgroupEnd();
      //#endregion
    }
    console.line('');
    if (hasError === false) {
      console.success('所有项目依赖结构正常');
    } else {
      console.info('建议优先修复后面的，可以更快地修复依赖问题');
    }
    console.log('');
  }
  async autoImport() {}
  /**
   * 执行初始化
   */
  async doLink() {
    /**
     * 读取项目配置
     */
    const { projectConfig } = this.bfsProject;
    const typedProjects = this.bfsProject.readAllTypedProjects();
    /**
     * 构建影子文件夹
     *
     * 这是一个使用.git/learn/yarn进行托管的独立项目，
     * 它隐匿地复制/引用开发者的代码，
     * 可以在其中进行编译
     */
    const shadowDirname = this.initShadowDir({ ignoreInGit: true });
    /**
     * 我们现在要在影子文件夹中进行项目克隆了
     *
     * 如此一个完整的项目才会被生成出来
     */
    {
      /// 在影子目录中构建项目目录
      const shadowProjects = this.initShadownProjects(projectConfig, shadowDirname, typedProjects);

      /// 清理缓存
      this._clearTsRefInfoCache();
      /// 使用通用规则初始化配置文件
      const _inited = new WeakSet<PKGM.Config.BfsTypedProject>();
      for (const mixProjectInfo of shadowProjects.projectInfoList) {
        await this.initShadownProjectConfigs(
          projectConfig,
          shadowDirname,
          mixProjectInfo,
          shadowProjects.nameMixProjectInfoMap,
          _inited
        );
      }
      /// 初始化根项目配置
      this.initShadownConfigs(
        projectConfig,
        shadowDirname,
        shadowProjects.projectInfoList,
        this.bfsProject.projectDirpath
      );
    }

    /**
     * 链接依赖项
     *
     * 安装依赖，并将本地包注册成依赖
     * 这里取决于 tsserver如何去加载依赖
     * 目前使用node_modules模式，所以这里就沿用node_modules模式，
     * 使用yarn 的workspaces模式进行依赖注册与安装
     * @TODO 将来需要将node_modules的依赖彻底从tsc中剥离掉，使用自己的依赖构建规则来进行构建
     *
     *
     * @TODO 基于 name+version 的规则，我们会发现整个项目中存在多个版本的包名，通过询问可能无法直接更新，我们可以写入“依赖升级警告”。从而使得那个项目的开发者在打开项目执行init的时候，会得到相对应的警告信息，告知其尽快升级。这一步操作，在bundle的时候尤为重要，因为打包可能会因此混入多个一样却不同版本的代码
     *
     */
    this.linkDependencies(shadowDirname);
  }
}
