import path from "node:path";

export const toPosixPath = (windowsPath: string) => {
  windowsPath = path.normalize(windowsPath); // 至少会返回 "."、 "a" 、 "a\\b"
  let somepath = slash(windowsPath);
  if (somepath.length > 1) {
    if (somepath.includes(":/") === false && somepath.startsWith(".") === false) {
      somepath = "./" + somepath;
    }
  }
  return somepath;
};
// export const toPosixOld = (windowsPath: string) => {
//   return windowsPath.replace(/^(\w):|\\+/g, "/$1");
// };
/**
 * ## slash
 * Convert Windows backslash paths to slash paths: `foo\\bar` ➔ `foo/bar`
 * @fork https://github.com/sindresorhus/slash/blob/main/index.js
 */
export function slash(path: string) {
  const isExtendedLengthPath = /^\\\\\?\\/.test(path);
  const hasNonAscii = /[^\u0000-\u0080]+/.test(path); // eslint-disable-line no-control-regex

  if (isExtendedLengthPath || hasNonAscii) {
    return path;
  }

  return path.replace(/\\+/g, "/");
}

//#region 路径相关的辅助函数
export const getExtname = (somepath: string) => {
  return somepath.match(/\.[^\\\/\.]+$/)?.[0] ?? "";
};
export const getSecondExtname = (somepath: string) => {
  return somepath.match(/(\.[^\\\/\.]+)\.[^\\\/\.]+$/)?.[1] ?? "";
};
export const getTwoExtnames = (somepath: string) => {
  const info = somepath.match(/(\.[^\\\/\.]+)(\.[^\\\/\.]+)$/);
  if (info !== null) {
    return {
      ext1: info[2],
      ext2: info[1],
    };
  }
};
export const PathInfoParser = (
  dir: string,
  somepath: string,
  isAbsolute = path.posix.isAbsolute(toPosixPath(somepath))
) => {
  const info = {
    get full() {
      const fullpath = isAbsolute ? somepath : path.join(dir, somepath);
      Object.defineProperty(info, "full", { value: fullpath });
      return fullpath;
    },
    get relative() {
      const relativepath = isAbsolute ? path.relative(dir, somepath) : somepath;
      Object.defineProperty(info, "relative", { value: relativepath });
      return relativepath;
    },
    get extname() {
      const extname = getExtname(somepath);
      Object.defineProperty(info, "extname", { value: extname });
      return extname;
    },
    get secondExtname() {
      const secondExtname = getSecondExtname(somepath);
      Object.defineProperty(info, "secondExtname", { value: secondExtname });
      return secondExtname;
    },
    dir,
  };
  return info;
};
/**
 * 截取分隔路径的符号，返回数组
 * @param path 
 * @returns path[]
 */
export const truncateWords = (path:string) => {
  if(!path) return [];
  return path.replace(/[\:"\?\!\$%#_/&\=\+\(\)\^\<\>\*\|\?\·\.\—\ˉ\°\-\–\\]/g, " ").split(/\s+/);
}
export type $PathInfo = ReturnType<typeof PathInfoParser>;
