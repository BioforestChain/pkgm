import * as fs from 'fs';
import '@bfchain/util-typings';
import { Injectable, Resolve } from '@bfchain/util-dep-inject';
import { PathHelper } from './pathHelper';
import { Config } from './config';
import * as chokidar from 'chokidar';

@Injectable()
export class Reader {
  constructor(private path: PathHelper, private config: Config) {}
  private _readFile = fs.readFileSync;
  readFile(path: string, encoding?: undefined): Buffer;
  readFile(path: string, encoding: PKGM.FS.BufferEncoding): string;
  readFile(path: string, encoding?: string): Buffer | string;
  readFile(path: string, encoding?: string) {
    return this._readFile(path, encoding as PKGM.FS.BufferEncoding) as unknown;
  }
  private _stat = fs.statSync;
  stat(path: string) {
    return this._stat(path);
  }
  isDirectory(pathname: string) {
    try {
      return this._stat(pathname).isDirectory();
    } catch {
      return false;
    }
  }
  isFile(pathname: string) {
    try {
      return this._stat(pathname).isFile();
    } catch {
      return false;
    }
  }
  private _exists = fs.existsSync;
  exists(pathname: string) {
    return this._exists(pathname);
  }
  private _readdir = fs.readdirSync;
  readdir(pathname: string) {
    return this._readdir(pathname, { withFileTypes: true });
  }
  private _realpath = fs.realpathSync;
  realpath(pathname: string) {
    return this._realpath(pathname);
  }

  private _watch = chokidar.watch;
  watch(filename: string, options: PKGM.FS.WatchOptions, listener: PKGM.FS.WatchListener) {
    const watcher = this._watch(filename, { ...options });
    watcher.once('ready', () => {
      watcher.on('all', listener);
    });
    return watcher;
  }
  private _watchFile = fs.watchFile;
  watchFile(filename: string, options: PKGM.FS.WatchOptions, listener: PKGM.FS.WatchFileListener) {
    return this._watchFile(filename, options, listener);
  }
  private _unwatchFile = fs.unwatchFile;
  unwatchFile(filename: string, listener: PKGM.FS.WatchFileListener) {
    return this._unwatchFile(filename, listener);
  }
  /**列举文件
   * PS：不会列举出文件夹
   */
  lsFiles(dirname: string, filenameFilter: (fileName: string) => boolean) {
    return this.lsAllFiles(dirname, filenameFilter, 1);
  }
  lsAllFiles(rootDirname: string, filenameFilter: (fileName: string) => boolean, deep = Infinity) {
    // 转成标准格式
    rootDirname = this.path.resolve(rootDirname);
    const targetFolderStat = this.stat(rootDirname);
    if (!targetFolderStat.isDirectory()) {
      throw new TypeError('need input floder path');
    }
    /**
     *
     * @param {string}folderPath
     */
    const lsAll = (folderPath: string, deep: number) => {
      const res: string[] = [];
      if (deep <= 0) {
        return res;
      }
      const dirList = this._readdir(folderPath);
      for (const childFileName of dirList) {
        /**
         * @TODO use gitignore and custom ignore
         */
        if (childFileName.startsWith('.')) {
          continue;
        }
        const fullChildPath = this.path.resolve(folderPath, childFileName);
        if (this._stat(fullChildPath).isDirectory()) {
          res.push(...lsAll(fullChildPath, deep - 1));
        } else if (filenameFilter(childFileName)) {
          res.push(fullChildPath);
        }
      }
      return res;
    };

    const fullFilePathList = lsAll(rootDirname, deep);
    return fullFilePathList.map((filePath) => {
      return this.path.relative(rootDirname, filePath);
    });
  }
  /**将路径一层层递归返回 */
  *pathBreadcrumb(pathname: string) {
    do {
      yield pathname;

      const lastSpeIndex = pathname.lastIndexOf(this.path.sep);
      if (lastSpeIndex === -1) {
        break;
      }
      pathname = pathname.slice(0, lastSpeIndex);
    } while (true);
  }
  *queryAllInBreadcrumb(
    somepath: string,
    filter: (refArg: { pathname: string; stat: PKGM.FS.Stats }) => boolean | undefined
  ) {
    const fullSomepath = this.path.resolve(somepath);

    for (const pathname of this.pathBreadcrumb(fullSomepath)) {
      try {
        const refArg = { pathname, stat: this._stat(pathname) };
        if (filter(refArg)) {
          yield refArg.pathname;
        }
      } catch {}
    }
  }
  queryOneInBreadcrumb(...args: BFChainUtil.AllArgument<Reader['queryAllInBreadcrumb']>) {
    for (const pathname of this.queryAllInBreadcrumb(...args)) {
      return pathname;
    }
  }
  /**
   * 寻找某一个路径中，可能存在与于路径某一层的文件
   * @param filename
   * @param treeFileName
   */
  queryOneFileInBreadcrumb(somepath: string, finder: string = 'package.json') {
    return this.queryOneInBreadcrumb(somepath, (refArg) => {
      try {
        if (refArg.stat.isDirectory()) {
          const filePathname = this.path.join(refArg.pathname, finder);
          if (this._stat(filePathname).isFile()) {
            refArg.pathname = filePathname;
            return true;
          }
        }
      } catch {}
    });
  }
  /**
   * 寻找某一个路径中，可能存在与于路径某一层的文件夹
   * @param somepath
   * @param maskFolder
   */
  queryAllDriectoryInBreadcrumb(somepath: string, finder: string = 'node_modules') {
    return this.queryAllInBreadcrumb(somepath, (refArg) => {
      try {
        if (refArg.stat.isDirectory()) {
          const dirPathname = this.path.join(refArg.pathname, finder);
          if (this._stat(dirPathname).isDirectory()) {
            refArg.pathname = dirPathname;
            return true;
          }
        }
      } catch {}
    });
  }
}
