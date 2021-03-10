import { bindThis, cacheGetter } from '@bfchain/util-decorator';
import { Injectable } from '@bfchain/util-dep-inject';
import * as fs from 'fs';
import { Decoder } from './decoder';
import { PathHelper } from './pathHelper';
import { Reader } from './reader';

@Injectable()
export class Writer {
  constructor(private reader: Reader, private decoder: Decoder, private path: PathHelper) {}

  private _writeFile = fs.writeFileSync;
  private _mkdir = fs.mkdirSync;
  private _unlink = fs.unlinkSync;
  private _rmdir = fs.rmdirSync;
  private _symlink = fs.symlinkSync;
  private _readlink = fs.readlinkSync;
  private _copyFile = fs.copyFileSync;
  private _rm: typeof fs.rmSync | undefined = fs.rmSync;
  makeDir(dir: string) {
    this._mkdir(dir, { recursive: true });
  }
  writeFile(filename: string, data: unknown, checkSame?: boolean) {
    this.makeDir(this.path.parse(filename).dir);
    if (typeof data === 'object' && !(data instanceof Uint8Array)) {
      data = this.decoder.decodeByFilepath(filename, data);
    }
    try {
      if (checkSame && String(data) === this.reader.readFile(filename, 'utf-8')) {
        return;
      }
    } catch {}

    this._writeFile(filename, data as string | Uint8Array);
  }
  deleteFile(filename: string) {
    this._unlink(filename);
  }
  private _deleteDirectoryNative(targetPath: string) {
    if (!this.reader.exists(targetPath)) {
      return;
    }
    this._rm!(targetPath, { recursive: true, force: true });
  }
  @cacheGetter
  get deleteAll() {
    if (this._rm) {
      return this._deleteDirectoryNative.bind(this);
    }
    const rm = (targetPath: string) => {
      if (!this.reader.exists(targetPath)) {
        return;
      }
      if (this.reader.isDirectory(targetPath)) {
        const items = this.reader.readdir(targetPath);
        for (const item of items) {
          const curPath = this.path.join(targetPath, item.name);
          // 递归刪除子項
          rm(curPath);
        }
        this._rmdir(targetPath);
      } else {
        this._unlink(targetPath);
      }
    };
    return rm;
  }
  deleteSome(
    rootPath: string,
    filter: (dirent: PKGM.FS.Dirent, info: { fullpath: string; deep: number }) => boolean | void,
    maxDeep = Infinity,
    curDeep = 1
  ) {
    const items = this.reader.readdir(rootPath);
    for (const item of items) {
      const info = new Proxy(
        {
          fullpath: '',
          deep: curDeep,
        },
        {
          get: (t, p, r) => {
            if (p === 'fullpath') {
              return t[p] || (t[p] = this.path.join(rootPath, item.name));
            }
            return Reflect.get(t, p, r);
          },
        }
      );

      if (filter(item, info)) {
        this.deleteAll(info.fullpath);
      } else if (curDeep < maxDeep && item.isDirectory()) {
        this.deleteSome(info.fullpath, filter, maxDeep, curDeep + 1);
      }
    }
  }

  writeOrDeleteFile(filename: string, data: unknown) {
    if (!data) {
      if (this.reader.exists(filename)) {
        this.deleteFile(filename);
      }
    } else {
      this.writeFile(filename, data);
    }
  }
  shallowClone(from: string, to: string) {
    from = this.path.resolve(from);
    if (!this._checkAndRmSymlink(to, from)) {
      this._symlink(from, to);
    }
  }
  copyFile(from: string, to: string) {
    if (this.reader.isFile(from)) {
      this.$copyFile(from, to);
    }
  }
  /**
   * 要注意如果目标存在，并且目标与预期的路径不符合，那么要事先进行删除，以确保拷贝正确运作
   * @param target
   */
  private _checkAndRmSymlink(target: string, checkerPath = this.path.resolve(target)) {
    try {
      if (this.reader.realpath(target) === checkerPath) {
        return true;
      }
      this._unlink(target);
    } catch {
      /// 可能symlink背后的路径已经不存在了，但是symlink本身还存在，尝试强制删除
      try {
        this._unlink(target);
      } catch {}
    }
    return false;
  }
  protected $copyFile(from: string, to: string) {
    /// 深拷贝，要避免软链接
    this._checkAndRmSymlink(to);
    this.makeDir(this.path.parse(to).dir);
    this._copyFile(from, to);
  }
  deepClone(from: string, to: string) {
    if (this.reader.isFile(from)) {
      this.$copyFile(from, to);
    } else if (this.reader.isDirectory(from)) {
      /// 深拷贝，要避免软链接
      this._checkAndRmSymlink(to);
      for (const filepath of this.reader.lsAllFiles(to, () => true)) {
        this.copyFile(this.path.join(from, filepath), this.path.join(to, filepath));
      }
    }
  }
  clone(from: string, to: string, deep?: boolean) {
    if (this.reader.exists(from)) {
      if (deep) {
        this.deepClone(from, to);
      } else {
        this.shallowClone(from, to);
      }
    } else {
      try {
        this._unlink(to);
      } catch {}
    }
  }
  private _open = fs.openSync;
  open(filename: string, flags: string | number, mode?: string | number) {
    return this._open(filename, flags, mode);
  }
  private _utimes = fs.utimesSync;
  utimes(pathname: string, atime: number | string | Date, mtime: number | string | Date) {
    this._utimes(pathname, atime, mtime);
  }
}
