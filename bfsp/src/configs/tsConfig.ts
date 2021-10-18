import { sleep } from "@bfchain/util-extends-promise";
import chokidar from "chokidar";
import path, { resolve } from "node:path";
import { Debug, Warn } from "../logger";
import {
  $PathInfo,
  fileIO,
  folderIO,
  getExtname,
  getSecondExtname,
  getTwoExtnames,
  List,
  ListArray,
  ListSet,
  Loopable,
  notGitIgnored,
  PathInfoParser,
  SharedAsyncIterable,
  SharedFollower,
  toPosixPath,
  walkFiles,
} from "../toolkit";
import type { $BfspUserConfig } from "./bfspUserConfig";
const log = Debug("bfsp:config/tsconfig");
const warn = Warn("bfsp:config/tsconfig");

// export const getFilename = (somepath: string) => {
//   return somepath.match(/([^\\\/]+)\.[^\\\/]+$/)?.[1] ?? "";
// };

const isTsFile = (filepathInfo: $PathInfo) => {
  const { relative } = filepathInfo;
  if (relative.endsWith("#bfsp.ts")) {
    return false;
  }
  const { extname } = filepathInfo;
  if (
    /// 在assets文件夹下的json文件
    (extname === ".json" && toPosixPath(filepathInfo.relative).startsWith("./assets/")) ||
    /// ts文件（忽略类型定义文件）
    (isTsExt(extname) && ".d" !== filepathInfo.secondExtname)
  ) {
    return notGitIgnored(filepathInfo.full); // promise<boolean>
  }
  return false;
};

const isTsExt = (extname: string) => {
  return (
    extname === ".ts" ||
    extname === ".tsx" ||
    extname === ".cts" ||
    extname === ".mts" ||
    extname === ".ctsx" ||
    extname === ".mtsx"
  );
};

const isTypeFile = (projectDirpath: string, filepath: string) =>
  filepath.endsWith(".type.ts") || filepath.startsWith("./typings/");

const isTestFile = (projectDirpath: string, filepath: string) => {
  if (filepath.startsWith("./tests/")) {
    const exts = getTwoExtnames(filepath);
    if (exts !== undefined) {
      return isTsExt(exts.ext1) && (".test" === exts.ext2 || ".bm" === exts.ext1);
    }
  }
  return false;
};

const isBinFile = (projectDirpath: string, filepath: string) => {
  if (filepath.startsWith("./bin/")) {
    const exts = getTwoExtnames(filepath);
    if (exts !== undefined) {
      return isTsExt(exts.ext1) && (".cmd" === exts.ext2 || ".tui" === exts.ext1);
    }
  }
  return false;
};

export class ProfileMap {
  static getProfileInfo = (somepath: string) => {
    let privatePath = somepath;
    let profiles: Bfsp.Profile[] | undefined;
    while (true) {
      const execRes = /\#[^\\\/\.]+/.exec(privatePath);
      if (execRes === null) {
        break;
      }
      privatePath = privatePath.slice(0, execRes.index) + privatePath.slice(execRes.index + execRes[0].length);
      (profiles ??= []).push(...(execRes[0].match(/\#[^\#]+/g) as any));
    }
    if (profiles !== undefined && profiles.length > 0) {
      const extLen = getExtname(privatePath).length;
      if (extLen !== 0) {
        privatePath = privatePath.slice(0, -extLen);
      }
      const pInfo: $ProfileInfo = { privatePath, profiles, sourcePath: somepath };
      return pInfo;
    }
  };
  private _map1 = new Map<
    /* #filepath */ string,
    Map</* profile */ string, /* filepath#profile */ string | /* duplication filepath#profile */ Set<string>>
  >();
  private _map2 = new Map</* filepath#profile */ string, $ProfileInfo>();
  addProfileInfo(pInfo: $ProfileInfo) {
    const profileMap = this._map1;
    let map = profileMap.get(pInfo.privatePath);
    if (map === undefined) {
      profileMap.set(pInfo.privatePath, (map = new Map()));
    }
    for (const profile of pInfo.profiles) {
      let sourceFiles = map.get(profile);
      if (sourceFiles !== undefined) {
        if (typeof sourceFiles === "string") {
          sourceFiles = new Set([sourceFiles, pInfo.sourcePath]);
        } else {
          sourceFiles.add(pInfo.sourcePath);
        }
        // if (oldSourceFile.size > 1) {
        //   warn(`Duplicate profile:'${profile}' in files:${["", ...oldSourceFile].join("\n\t")}`);
        //   continue;
        // }
      } else {
        sourceFiles = pInfo.sourcePath;
      }
      map.set(profile, sourceFiles);
    }
    this._map2.set(pInfo.sourcePath, pInfo);
  }
  removeProfileInfo(sourcePath: string) {
    const pInfo = this._map2.get(sourcePath);
    if (pInfo === undefined) {
      return false;
    }
    this._map2.delete(sourcePath);
    const profileMap = this._map1;
    const map = profileMap.get(pInfo.privatePath);
    if (map === undefined) {
      return false;
    }
    for (const profile of pInfo.profiles) {
      let oldSourceFile = map.get(profile);
      if (oldSourceFile === undefined) {
        continue;
      }
      if (typeof oldSourceFile === "string") {
        map.delete(profile);
      } else {
        oldSourceFile.delete(sourcePath);
        if (oldSourceFile.size === 1) {
          map.set(profile, oldSourceFile.values().next().value!);
        }
      }
    }
  }
  toTsPaths(_profileNameList: string[] = ["default"]) {
    const paths: { [key: Bfsp.Profile]: string[] } = {};
    log("profiles", _profileNameList);
    const profileList = _profileNameList.map((profile) => {
      if (profile.startsWith("#") === false) {
        profile = "#" + profile;
      }
      return profile as Bfsp.Profile;
    });

    debugger;
    for (const [privatePath, map] of this._map1) {
      const profilePaths = new Set<string>();

      // const multiProfileSources =
      /// 优先根据profiles来插入
      for (const profile of profileList) {
        const sourceFiles = map.get(profile);
        if (sourceFiles === undefined) {
          continue;
        }
        if (typeof sourceFiles === "string") {
          profilePaths.add(sourceFiles);
        } else {
          /// 从多个sourceFile中对比出于profiles匹配程度最高的sourceFile
          let pInfoList: $ProfileInfo[] = [];
          for (const sourceFile of sourceFiles) {
            const pInfo = this._map2.get(sourceFile);
            if (pInfo !== undefined) {
              pInfoList.push(pInfo);
            }
          }
          /// 1. 使用剩余的profiles来进行匹配，计算出得分
          const restProfileList = profileList.slice(profileList.indexOf(profile) + 1);
          if (restProfileList.length > 0) {
            let maxProfileInfos = new Set<$ProfileInfo>();
            let maxProfileInfoScore = 0;
            for (const pInfo of pInfoList) {
              let score = 0;
              for (const [i, profile] of restProfileList.entries()) {
                if (pInfo.profiles.includes(profile)) {
                  score += 2 ** (restProfileList.length - i);
                }
              }
              if (score === maxProfileInfoScore) {
                maxProfileInfos.add(pInfo);
              } else if (score > maxProfileInfoScore) {
                maxProfileInfoScore =score
                maxProfileInfos = new Set([pInfo]);
              }
            }

            pInfoList = [...maxProfileInfos];
            /// 如果只有一个最高分，直接返回；
            if (pInfoList.length === 1) {
              profilePaths.add(pInfoList[0].sourcePath);
              continue;
            }
          }
          /// 1. 使用少即是多的原则进行排序
          /// 2. 根据文件名字顺序进行匹配
          pInfoList.sort((a, b) => {
            if (a.profiles.length === b.profiles.length) {
              return a.sourcePath.localeCompare(b.sourcePath);
            }
            return a.profiles.length - b.profiles.length;
          });
          profilePaths.add(pInfoList[0].sourcePath);
        }
      }

      /// 否则使用默认顺序来插入
      for (const sourceFiles of map.values()) {
        if (typeof sourceFiles === "string") {
          profilePaths.add(sourceFiles);
        } else {
          profilePaths.add(sourceFiles.values().next().value!);
        }
      }

      paths[`#${privatePath.slice(2 /* './' */)}`] = [...profilePaths];
    }
    return paths;
  }
}
export type $ProfileInfo = { privatePath: string; sourcePath: string; profiles: Bfsp.Profile[] };

type TsFilesLists = {
  allFiles: List<string>;
  notypeFiles: List<string>;
  notestFiles: List<string>;
  typeFiles: List<string>;
  testFiles: List<string>;
  binFiles: List<string>;
  profileMap: ProfileMap;
};
export const groupTsFilesByAdd = (projectDirpath: string, tsFiles: Iterable<string>, lists: TsFilesLists) => {
  for (const filepath of tsFiles) {
    lists.allFiles.add(filepath);

    if (isTypeFile(projectDirpath, filepath)) {
      lists.typeFiles.add(filepath);
    } else {
      lists.notypeFiles.add(filepath);
    }

    if (isTestFile(projectDirpath, filepath)) {
      lists.testFiles.add(filepath);
    } else {
      lists.notestFiles.add(filepath);
    }

    if (isBinFile(projectDirpath, filepath)) {
      lists.binFiles.add(filepath);
    }

    const pInfo = ProfileMap.getProfileInfo(filepath);

    if (pInfo !== undefined) {
      lists.profileMap.addProfileInfo(pInfo);
    }
  }
};
export const groupTsFilesByRemove = (projectDirpath: string, tsFiles: Iterable<string>, lists: TsFilesLists) => {
  for (const filepath of tsFiles) {
    lists.allFiles.remove(filepath);

    if (isTypeFile(projectDirpath, filepath)) {
      lists.typeFiles.remove(filepath);
    } else {
      lists.notypeFiles.remove(filepath);
    }

    if (isTestFile(projectDirpath, filepath)) {
      lists.testFiles.remove(filepath);
    } else {
      lists.notestFiles.remove(filepath);
    }

    if (isBinFile(projectDirpath, filepath)) {
      lists.binFiles.remove(filepath);
    }

    lists.profileMap.removeProfileInfo(filepath);
  }
};

export const generateTsConfig = async (projectDirpath: string, bfspUserConfig: $BfspUserConfig) => {
  const allTsFileList = await walkFiles(projectDirpath, (fullDirpath) => notGitIgnored(fullDirpath))
    .map((fullFilepath) => PathInfoParser(projectDirpath, fullFilepath, true))
    .filter((pathInfo) => isTsFile(pathInfo))
    .map((pathInfo) => toPosixPath(pathInfo.relative))
    .toArray();

  const tsFilesLists: TsFilesLists = {
    allFiles: new ListSet(allTsFileList),
    notypeFiles: new ListArray<string>(),
    notestFiles: new ListArray<string>(),
    typeFiles: new ListSet<string>(),
    testFiles: new ListSet<string>(),
    binFiles: new ListSet<string>(),
    profileMap: new ProfileMap(),
  };

  groupTsFilesByAdd(projectDirpath, allTsFileList, tsFilesLists);

  const tsConfig = {
    compilerOptions: {
      composite: true,
      noEmit: true,
      declaration: true,
      sourceMap: false,
      target: "es2020",
      module: "es2020",
      lib: ["ES2020"],
      outDir: "./node_modules/.bfsp/tsc",
      importHelpers: true,
      isolatedModules: false,
      strict: true,
      noImplicitAny: true,
      strictNullChecks: true,
      strictFunctionTypes: true,
      strictBindCallApply: true,
      strictPropertyInitialization: true,
      noImplicitThis: true,
      alwaysStrict: true,
      moduleResolution: "node",
      resolveJsonModule: true,
      // baseUrl: "./",
      // types: ["node"],
      paths: tsFilesLists.profileMap.toTsPaths(bfspUserConfig.userConfig.profiles),
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
    },
    references: [
      {
        path: "./tsconfig.isolated.json",
      },
      {
        path: "./tsconfig.typings.json",
      },
    ] as const,
    files: tsFilesLists.notestFiles.toArray(),
  };
  const tsIsolatedConfig = {
    extends: "./tsconfig.json",
    compilerOptions: {
      isolatedModules: true,
      outDir: "./node_modules/.bfsp/tsc",
      noEmit: false,
    },
    files: tsFilesLists.notypeFiles.toArray(),
    references: [],
  };

  const tsTypingsConfig = {
    extends: "./tsconfig.json",
    compilerOptions: {
      isolatedModules: false,
      outDir: "./typings/dist",
      noEmit: false,
    },
    files: tsFilesLists.typeFiles.toArray(),
    references: [],
  };

  return {
    tsFilesLists,

    json: tsConfig,
    isolatedJson: tsIsolatedConfig,
    typingsJson: tsTypingsConfig,
  };
};

export type $TsConfig = BFChainUtil.PromiseReturnType<typeof generateTsConfig>;
export const writeTsConfig = (projectDirpath: string, bfspUserConfig: $BfspUserConfig, tsConfig: $TsConfig) => {
  return Promise.all([
    fileIO.set(resolve(projectDirpath, "tsconfig.json"), Buffer.from(JSON.stringify(tsConfig.json, null, 2))),
    fileIO.set(
      resolve(projectDirpath, tsConfig.json.references[0].path),
      Buffer.from(JSON.stringify(tsConfig.isolatedJson, null, 2))
    ),
    (async () => {
      await fileIO.set(
        resolve(projectDirpath, tsConfig.json.references[1].path),
        Buffer.from(JSON.stringify(tsConfig.typingsJson, null, 2))
      );
      /**index文件可以提交 */
      const indexFilepath = resolve(projectDirpath, "typings/index.d.ts");
      /**dist文件不可以提交，所以自动生成的代码都在dist中，index中只保留对dist的引用 */
      const distFilepath = resolve(projectDirpath, "typings/dist.d.ts");
      // const parseToEsmPath = (filepath: string) =>
      //   toPosixPath(path.relative("typings", filepath.slice(0, -path.extname(filepath).length)));
      const parseTypingFileToEsmPath = (filepath: string) =>
        toPosixPath(
          path.relative(
            "typings",
            path.join("typings/dist", filepath.slice(0, -path.extname(filepath).length) + ".d.ts")
          )
        );
      const indexFileCodeReg =
        /\/\/▼▼▼AUTO GENERATE BY BFSP, DO NOT EDIT▼▼▼[\w\W]+?\/\/▲▲▲AUTO GENERATE BY BFSP, DO NOT EDIT▲▲▲/g;
      const indexFileSnippet = `//▼▼▼AUTO GENERATE BY BFSP, DO NOT EDIT▼▼▼\n/// <reference path="./dist.d.ts"/>\n//▲▲▲AUTO GENERATE BY BFSP, DO NOT EDIT▲▲▲`;
      const distFileContent =
        `/// ▼▼▼AUTO GENERATE BY BFSP, DO NOT EDIT▼▼▼\n` +
        // `export * from "${parseToEsmPath(bfspUserConfig.exportsDetail.indexFile)}";\n` +
        tsConfig.tsFilesLists.typeFiles
          .toArray()
          .map((filepath) => `/// <reference path="${parseTypingFileToEsmPath(filepath)}" />`)
          .join("\n");

      /// 自动创建的相关文件与代码
      await folderIO.tryInit(resolve(projectDirpath, "typings"));
      await fileIO.set(distFilepath, Buffer.from(distFileContent));
      const indexFileContent = (await fileIO.has(indexFilepath)) ? (await fileIO.get(indexFilepath)).toString() : "";

      if (indexFileContent.match(indexFileCodeReg)?.[0] !== indexFileSnippet) {
        // @todo 可能使用语法分析来剔除这个import会更好一些
        // @todo 需要进行fmt
        await fileIO.set(
          indexFilepath,
          Buffer.from(indexFileSnippet + "\n\n" + indexFileContent.replace(indexFileCodeReg, "").trimStart())
        );
      }
    })(),
  ]);
};

export const watchTsConfig = (
  projectDirpath: string,
  bfspUserConfigStream: SharedAsyncIterable<$BfspUserConfig>,
  options: {
    tsConfigInitPo?: BFChainUtil.PromiseMaybe<$TsConfig>;
    write?: boolean;
  } = {}
) => {
  const { write = false } = options;
  const follower = new SharedFollower<$TsConfig>();

  let tsConfig: $TsConfig | undefined;
  let preTsConfigJson = "";
  /// 循环处理监听到的事件
  const looper = Loopable("watch tsconfigs", async (reasons) => {
    log("reasons:", reasons);
    const bfspUserConfig = await bfspUserConfigStream.getCurrent();
    if (tsConfig === undefined) {
      follower.push((tsConfig = await (options.tsConfigInitPo ?? generateTsConfig(projectDirpath, bfspUserConfig))));
    }

    const { tsFilesLists } = tsConfig;
    while (cachedEventList.size !== 0) {
      // 归类, 然后清空缓存
      const addFileList: string[] = [];
      const removeFileList: string[] = [];
      for (const [path, type] of cachedEventList) {
        const posixPath = toPosixPath(path);
        if (type === "add") {
          addFileList.push(posixPath);
        } else {
          removeFileList.push(posixPath);
        }
      }
      cachedEventList.clear();
      log("add", addFileList);
      log("unlink", removeFileList);

      /// 将变更的文件写入tsconfig中
      if (addFileList.length > 0) {
        groupTsFilesByAdd(projectDirpath, addFileList, tsFilesLists);
      }
      if (removeFileList.length > 0) {
        groupTsFilesByRemove(projectDirpath, removeFileList, tsFilesLists);
      }

      tsConfig.json.files = tsFilesLists.notestFiles.toArray();
      tsConfig.isolatedJson.files = tsFilesLists.notypeFiles.toArray();
      tsConfig.typingsJson.files = tsFilesLists.typeFiles.toArray();
    }

    tsConfig.json.compilerOptions.paths = tsFilesLists.profileMap.toTsPaths(bfspUserConfig.userConfig.profiles);

    const newTsConfigJson = JSON.stringify(tsConfig.json);
    if (preTsConfigJson === newTsConfigJson) {
      return;
    }
    preTsConfigJson = newTsConfigJson;

    if (write) {
      await writeTsConfig(projectDirpath, bfspUserConfig, tsConfig);
    }

    log("tsconfig changed!!");
    follower.push(tsConfig);
  });

  //#region 监听文件变动来触发更新
  const watcher = chokidar.watch(
    ["assets/**/*.json", "**/*.ts", "**/*.tsx", "**/*.cts", "**/*.mts", "**/*.ctsx", "**/*.mtsx"],
    {
      cwd: projectDirpath,
      ignoreInitial: false,
      followSymlinks: true,
      ignored: ["*.d.ts", "typings/dist", "dist", "#bfsp.ts", "node_modules"],
    }
  );

  type EventType = "add" | "unlink";
  let cachedEventList = new Map<string, EventType>();
  /// 收集监听到事件
  watcher.on("add", async (path) => {
    if (await isTsFile(PathInfoParser(projectDirpath, path))) {
      log("add file", path);
      cachedEventList.set(path, "add");
      looper.loop("add file", 200);
    }
  });
  watcher.on("unlink", async (path) => {
    if (await isTsFile(PathInfoParser(projectDirpath, path))) {
      log("unlink file", path);
      cachedEventList.set(path, "unlink");
      looper.loop("unlink file", 200);
    }
  });
  //#endregion

  //#region 监听依赖配置来触发更新
  bfspUserConfigStream.onNext(() => looper.loop("bfsp user config changed"));
  //#endregion

  /// 初始化，使用400ms时间来进行防抖
  looper.loop("init", 400);
  return new SharedAsyncIterable<$TsConfig>(follower);
};
