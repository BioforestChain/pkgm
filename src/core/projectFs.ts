import { Injectable, ModuleStroge, Resolve } from '@bfchain/util-dep-inject';
import { esmEs5 } from '../assets/tsconfig.base';
import { Config } from '../helper/config';
import { Encoder } from '../helper/encoder';
import { PathHelper } from '../helper/pathHelper';
import { Reader } from '../helper/reader';
import { Writer } from '../helper/writer';

@Injectable()
export class ProjectFileSystem {
  static from(moduleStore = new ModuleStroge()) {
    return Resolve(ProjectFileSystem, moduleStore);
  }
  constructor(
    private encoder: Encoder,
    private reader: Reader,
    private writer: Writer,
    private config: Config,
    private path: PathHelper
  ) {}
  formatProjectSearchConfig(projectDirpath?: string) {
    const config: PKGM.ProjectFS.ProjectSearchConfig = {
      projectConfigFilename: this.config.projectConfigFilename,
      projectDirpath,
      maskDirname: this.config.projectShadowDirname,
    };
    return config;
  }
  /**解析成项目中的路径 */
  *pathResolveInProject(somepath: string, config: PKGM.ProjectFS.ProjectSearchConfig) {
    somepath = this.path.resolve(somepath);
    yield { pathname: somepath, inMask: false };
    /// 获取项目目录
    let { projectDirpath, projectConfigFilename = this.config.projectConfigFilename } = config;
    const projectConfigFilepath = this.reader.queryOneFileInBreadcrumb(
      somepath,
      projectConfigFilename
    );
    if (!projectConfigFilepath) {
      throw new SyntaxError('could not find project.');
    }
    const projectConfig = this.encoder.encodeByFilepath<PKGM.Config.BfsProject>(
      projectConfigFilepath
    );
    // console.log('projectConfigFilepath:', projectConfigFilepath, projectConfig);

    if (!projectDirpath) {
      projectDirpath = this.path.parse(projectConfigFilepath).dir;
    }
    /// 获取所要读取的文件相对于项目目录的位置
    let inMaskpath = this.path.relative(projectDirpath, somepath);
    const inMaskpaths: string[] = [];
    // console.log('inMaskpath:', inMaskpath, projectDirpath, somepath);
    {
      /// 自定义解析路径
      if (config.inMaskPathResolver) {
        inMaskpaths.push(config.inMaskPathResolver(inMaskpath));
      } else {
        inMaskpaths.push(this.path.join(`packages/${projectConfig.name}`, inMaskpath), inMaskpath);
      }
    }

    // console.log('inMaskpath:', inMaskpath);
    /// 递归地在面具文件夹中查询文件
    const { maskDirname = this.config.projectShadowDirname } = config;
    for (const maskDir of this.reader.queryAllDriectoryInBreadcrumb(projectDirpath, maskDirname)) {
      for (const imp of inMaskpaths) {
        yield { pathname: this.path.join(maskDir, imp), inMask: true };
      }
    }
  }
  /**
   * 搜索项目中的文件或者文件夹
   * @param somepath
   * @param filter
   * @param config
   */
  *queryInProject(
    somepath: string,
    filter: (argsRef: {
      pathname: string;
      stats: PKGM.FS.Stats;
      inMask: boolean;
    }) => boolean | undefined,
    config: PKGM.ProjectFS.ProjectSearchConfig
  ) {
    for (const pathInfo of this.pathResolveInProject(somepath, config)) {
      try {
        const argsRef = { ...pathInfo, stats: this.reader.stat(pathInfo.pathname) };
        if (filter(argsRef)) {
          yield argsRef.pathname;
        }
      } catch {}
    }
  }
  queryOneInProject(...args: BFChainUtil.AllArgument<ProjectFileSystem['queryInProject']>) {
    for (const pathname of this.queryInProject(...args)) {
      return pathname;
    }
  }
  /**
   * 读取项目中的文件
   * 支持读取面具文件夹
   * @param filename
   * @param config
   */
  readFileInProject(
    filename: string,
    config: PKGM.ProjectFS.ProjectSearchConfig & {
      encoding?: 'binary' | 'utf-8';
    } = {}
  ) {
    const inProjectFilename = this.queryOneInProject(
      filename,
      ({ stats }) => stats.isFile(),
      config
    );
    const { encoding /*  = 'utf-8'  */ } = config;
    if (!inProjectFilename) {
      return this.reader.readFile(filename, encoding);
    }
    return this.reader.readFile(inProjectFilename, encoding);
  }
  readdirInProject(pathname: string, config: PKGM.ProjectFS.ProjectSearchConfig = {}) {
    const inProjectPathname = this.queryOneInProject(
      pathname,
      ({ stats }) => stats.isDirectory(),
      config
    );
    if (!inProjectPathname) {
      return this.reader.readdir(pathname);
    }
    return this.reader.readdir(pathname);
  }
  statInProject(pathname: string, config: PKGM.ProjectFS.ProjectSearchConfig = {}) {
    const inProjectPathname = this.queryOneInProject(pathname, () => true, config);
    if (!inProjectPathname) {
      return this.reader.stat(pathname);
    }
    return this.reader.stat(inProjectPathname);
  }
  /**
   * 向项目中写入文件，如果在原本的路径中没有找到文件，则写入到面具文件夹中
   * @param filename
   * @param config
   * @param data
   */
  writeFileInProject(
    filename: string,
    config: PKGM.ProjectFS.ProjectSearchConfig,
    data: unknown,
    options: { writeInTruly?: boolean }
  ) {
    let createFilename: string | undefined = options.writeInTruly
      ? this.path.resolve(filename)
      : undefined;
    let trulyFilename: string | undefined;
    for (const pathInfo of this.pathResolveInProject(filename, config)) {
      try {
        if (this.reader.stat(pathInfo.pathname).isFile()) {
          trulyFilename = pathInfo.pathname;
        }
      } catch {}
      if (createFilename === undefined && pathInfo.inMask) {
        createFilename = pathInfo.pathname;
      }
      if (pathInfo.inMask) {
        break;
      }
    }

    if (trulyFilename) {
      return this.writer.writeFile(trulyFilename, data);
    }
    if (createFilename) {
      return this.writer.writeFile(createFilename, data);
    }
    throw new Error(`ENOENT: no such file or directory, open '${filename}'`);
  }

  realpathInProject(filename: string, config: PKGM.ProjectFS.ProjectSearchConfig = {}) {
    const inProjectFilename = this.queryOneInProject(filename, () => true, config);
    return this.reader.realpath(inProjectFilename || filename);
  }
  watchInProject(
    pathname: string,
    options: PKGM.ProjectFS.ProjectSearchConfig & PKGM.FS.WatchOptions,
    listener: PKGM.FS.WatchListener
  ) {
    const inProjectPathname = this.queryOneInProject(pathname, () => true, options);
    if (!inProjectPathname) {
      return this.reader.watch(pathname, options, listener);
    }
    return this.reader.watch(inProjectPathname, options, listener);
  }
  watchFileInProject(
    filename: string,
    options: PKGM.ProjectFS.ProjectSearchConfig & PKGM.FS.WatchOptions,
    listener: PKGM.FS.WatchFileListener
  ) {
    const inProjectFilename = this.queryOneInProject(
      filename,
      ({ stats }) => stats.isFile(),
      options
    );
    if (!inProjectFilename) {
      return this.reader.watchFile(filename, options, listener);
    }
    return this.reader.watchFile(inProjectFilename, options, listener);
  }
  unwatchFileInProject(
    filename: string,
    listener: PKGM.FS.WatchFileListener,
    config: PKGM.ProjectFS.ProjectSearchConfig = {}
  ) {
    const inProjectFilename = this.queryOneInProject(
      filename,
      ({ stats }) => stats.isFile(),
      config
    );
    if (!inProjectFilename) {
      return this.reader.unwatchFile(filename, listener);
    }
    return this.reader.unwatchFile(inProjectFilename, listener);
  }
  openInProject(
    filename: string,
    config: PKGM.ProjectFS.ProjectSearchConfig & { flag: number | string; mode?: string | number }
  ) {
    const inProjectFilename = this.queryOneInProject(filename, () => true, config);
    if (!inProjectFilename) {
      return this.writer.open(filename, config.flag, config.mode);
    }
    return this.writer.open(inProjectFilename, config.flag, config.mode);
  }
  utimesInProject(
    pathname: string,
    config: PKGM.ProjectFS.ProjectSearchConfig & {
      atime: number | string | Date;
      mtime: number | string | Date;
    }
  ) {
    const inProjectFilename = this.queryOneInProject(pathname, () => true, config);
    if (!inProjectFilename) {
      return this.writer.utimes(pathname, config.atime, config.mtime);
    }
    return this.writer.utimes(pathname, config.atime, config.mtime);
  }
}
