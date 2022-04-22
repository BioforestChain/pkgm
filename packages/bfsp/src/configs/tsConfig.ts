import { existsSync } from "node:fs";
import path, { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { chalk } from "@bfchain/pkgm-base/lib/chalk";

import { TscIsolatedOutRootPath, TscOutRootPath, TscTypingsOutRootPath } from "../consts";
import { DevLogger } from "../../sdk/logger/logger";
import type { $BfspUserConfig } from "./bfspUserConfig";
import { ListArray, ListSet, List } from "../../sdk/toolkit/toolkit";
import { PathInfoParser, toPosixPath, getExtname } from "../../sdk/toolkit/toolkit.path";
import { jsonClone } from "../../sdk/toolkit/toolkit.util";
import { getWatcher } from "../../sdk/toolkit/toolkit.watcher";
import { Loopable, SharedAsyncIterable, SharedFollower } from "../../sdk/toolkit/toolkit.stream";
import { fileIO, folderIO, walkFiles, writeJsonConfig } from "../../sdk/toolkit/toolkit.fs";
import { isTsFile, notGitIgnored, isBinFile, isTestFile, isTypeFile } from "../../sdk/toolkit/toolkit.lang";
const debug = DevLogger("bfsp:config/tsconfig");

// export const getFilename = (somepath: string) => {
//   return somepath.match(/([^\\\/]+)\.[^\\\/]+$/)?.[1] ?? "";
// };

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
  constructor(private logger: PKGM.Logger) {}

  private _privatepathMap = new Map<
    /* #filepath */ string,
    Map</* profile */ string, /* filepath#profile */ string | Set<string /* filepath#profile */>>
  >();
  private _filepathPinfo = new Map</* filepath#profile */ string, $ProfileInfo>();
  /**
   * 没有被profiles命中的文件
   * 最终会从files中排除出去
   */
  private _unuseFiles = new Set<string>();
  get unuseFiles() {
    return this._unuseFiles as ReadonlySet<string>;
  }

  addProfileInfo(pInfo: $ProfileInfo) {
    const privatepathMap = this._privatepathMap;
    let map = privatepathMap.get(pInfo.privatePath);
    if (map === undefined) {
      privatepathMap.set(pInfo.privatePath, (map = new Map()));
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
    this._filepathPinfo.set(pInfo.sourcePath, pInfo);
  }
  removeProfileInfo(sourcePath: string) {
    const pInfo = this._filepathPinfo.get(sourcePath);
    if (pInfo === undefined) {
      return false;
    }
    this._filepathPinfo.delete(sourcePath);
    const privatepathMap = this._privatepathMap;
    const map = privatepathMap.get(pInfo.privatePath);
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
  private _profileErrorLogs: string[] = [];
  toTsPaths(_profileNameList: string[] = ["default"]) {
    const paths: { [key: Bfsp.Profile]: string[] } = {};
    const profileList = _profileNameList.map((profile) => {
      if (profile.startsWith("#") === false) {
        profile = "#" + profile;
      }
      return profile as Bfsp.Profile;
    });
    this._profileErrorLogs.length = 0;

    for (const [privatePath, map] of this._privatepathMap) {
      const profilePaths = new Set<string>();

      // const multiProfileSources =
      /**
       * 这里只挑选有被profile命中的，其它一概不选
       */
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
            const pInfo = this._filepathPinfo.get(sourceFile);
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
                maxProfileInfoScore = score;
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

          if (pInfoList.length > 0) {
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
      }

      if (profilePaths.size === 0) {
        this._profileErrorLogs.push(
          `no match any profile paths of '${chalk.blue(privatePath)}' with config: ${chalk.red(profileList.join())}`
        );
      }

      /**
       * 将其它没有使用上的文件收集起来
       */
      for (const sourceFiles of map.values()) {
        if (typeof sourceFiles === "string") {
          if (profilePaths.has(sourceFiles) === false) {
            this._unuseFiles.add(sourceFiles);
          }
        } else {
          for (const sourceFile of sourceFiles) {
            if (profilePaths.has(sourceFile) === false) {
              this._unuseFiles.add(sourceFile);
            }
          }
        }
      }

      if (profilePaths.size !== 0) {
        paths[`#${privatePath.slice(2 /* './' */)}`] = [...profilePaths];
      }
    }

    if (this._profileErrorLogs.length > 0) {
      this.logger.error.pin("profile", this._profileErrorLogs.join("\n"));
    }

    return paths;
  }
}
export type $ProfileInfo = { privatePath: string; sourcePath: string; profiles: Bfsp.Profile[] };

export type TsFilesLists = {
  allFiles: List<string>;
  isolatedFiles: List<string>;
  typeFiles: List<string>;
  testFiles: List<string>;
  binFiles: List<string>;
  profileMap: ProfileMap;
};
export const groupTsFilesByAdd = (projectDirpath: string, tsFiles: Iterable<string>, lists: TsFilesLists) => {
  for (const filepath of tsFiles) {
    lists.allFiles.add(filepath);

    const isType = isTypeFile(projectDirpath, filepath);
    const isTest = isTestFile(projectDirpath, filepath);
    if (isType) {
      lists.typeFiles.add(filepath);
    }
    if (isTest) {
      lists.testFiles.add(filepath);
    }

    if (isType === false /* && isTest === false */) {
      lists.isolatedFiles.add(filepath);
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
      lists.isolatedFiles.remove(filepath);
    }

    if (isTestFile(projectDirpath, filepath)) {
      lists.testFiles.remove(filepath);
    } else {
      lists.isolatedFiles.remove(filepath);
    }

    if (isBinFile(projectDirpath, filepath)) {
      lists.binFiles.remove(filepath);
    }

    lists.profileMap.removeProfileInfo(filepath);
  }
};

export const getTsconfigFiles = (list: TsFilesLists, field: keyof Omit<TsFilesLists, "profileMap">) => {
  return list[field].toArray().filter((filepath) => list.profileMap.unuseFiles.has(filepath) === false);
};

const _generateUser_CompilerOptionsBase = (bfspUserConfig: $BfspUserConfig) => {
  return {
    json: {
      /**
       * 默认的参数配置
       */
      composite: true,
      noEmit: true,
      declaration: true,
      sourceMap: false,
      target: "es2020",
      module: "es2020",
      lib: ["ES2020"],
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
      emitDeclarationOnly: false,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      emitDecoratorMetadata: true,
      experimentalDecorators: true,

      // baseUrl: "./",
      // types: ["node"],

      /**
       * 开发者自己定义的参数
       */
      ...(bfspUserConfig.userConfig.tsConfig?.compilerOptions ?? {}),
    },
    isolatedJson: {
      isolatedModules: true,
      noEmit: false,
      emitDeclarationOnly: false,
      typeRoots: [] as string[],
      types: [] as string[],
    },
    typingsJson: {
      isolatedModules: false,
      noEmit: false,
      emitDeclarationOnly: true,
    },
  };
};
const _generateUser_References = async (bfspUserConfig: $BfspUserConfig) => {
  const depRefs = await bfspUserConfig.extendsService.tsRefs;
  return {
    json: [
      {
        path: "./tsconfig.isolated.json",
      },
      {
        path: "./tsconfig.typings.json",
      },
      ...depRefs,
    ],
    isolatedJson: [
      {
        path: "./tsconfig.typings.json",
      },
      ...depRefs.map((x) => ({ path: x.path.replace("tsconfig.json", "tsconfig.isolated.json") })),
    ],
    typingsJson: [],
  };
};

export const generateTsConfig = async (
  projectDirpath: string,
  bfspUserConfig: $BfspUserConfig,
  options: { outDirRoot?: string; outDirName?: string; logger: PKGM.TuiLogger }
) => {
  const allTsFileList = await walkFiles(projectDirpath, {
    dirFilter: async (fullDirpath) => await notGitIgnored(fullDirpath),
    skipSymLink: true,
  })
    .map((fullFilepath) => PathInfoParser(projectDirpath, fullFilepath, true))
    .filter((pathInfo) => isTsFile(pathInfo))
    .map((pathInfo) => toPosixPath(pathInfo.relative))
    .toArray();

  const tsFilesLists: TsFilesLists = {
    allFiles: new ListSet(allTsFileList),
    isolatedFiles: new ListArray<string>(),
    typeFiles: new ListSet<string>(),
    testFiles: new ListSet<string>(),
    binFiles: new ListSet<string>(),
    profileMap: new ProfileMap(
      options.logger.panel?.createLoggerKit({ name: "profile", order: 11, prefix: "profile:" }).logger ?? options.logger
    ),
  };

  groupTsFilesByAdd(projectDirpath, allTsFileList, tsFilesLists);

  /// 生成配置
  const userCompilerOptionsBase = _generateUser_CompilerOptionsBase(bfspUserConfig);
  const userReferences = await _generateUser_References(bfspUserConfig);

  /// 组合配置
  const tsConfig = {
    compilerOptions: {
      ...userCompilerOptionsBase.json,
      /**
       * 不可被定义的
       */
      outDir: TscOutRootPath(options.outDirRoot, options.outDirName),
      paths: tsFilesLists.profileMap.toTsPaths(bfspUserConfig.userConfig.profiles),
    },
    references: userReferences.json,
    files: [] as string[],
  };

  const tsIsolatedConfig = {
    extends: "./tsconfig.json",
    compilerOptions: {
      ...userCompilerOptionsBase.isolatedJson,
      outDir: TscOutRootPath(options.outDirRoot, options.outDirName), //因为 #40 isolated没有任何输出，所以outDir就在输出根目录
    },
    files: getTsconfigFiles(tsFilesLists, "isolatedFiles"),
    references: userReferences.isolatedJson,
  };

  const tsTypingsConfig = {
    extends: "./tsconfig.json",
    compilerOptions: {
      ...userCompilerOptionsBase.typingsJson,
      outDir: TscOutRootPath(options.outDirRoot, options.outDirName), //因为 #40 typings无需另外建立文件夹，isolated和typings只不过是生成类型的两个阶段而已
    },
    files: getTsconfigFiles(tsFilesLists, "typeFiles"),
    references: userReferences.typingsJson,
  };

  return {
    tsFilesLists,

    json: tsConfig,
    isolatedJson: tsIsolatedConfig,
    typingsJson: tsTypingsConfig,
  };
};

export type $TsConfig = Awaited<ReturnType<typeof generateTsConfig>>;
export const writeTsConfig = (projectDirpath: string, bfspUserConfig: $BfspUserConfig, tsConfig: $TsConfig) => {
  return Promise.all([
    writeJsonConfig(resolve(projectDirpath, "tsconfig.json"), tsConfig.json),
    writeJsonConfig(resolve(projectDirpath, tsConfig.json.references[0].path), tsConfig.isolatedJson),
    ,
    (async () => {
      await writeJsonConfig(resolve(projectDirpath, tsConfig.json.references[1].path), tsConfig.typingsJson);

      const { outDir } = tsConfig.typingsJson.compilerOptions;
      const outDirInfo = path.parse(outDir);
      /**index文件可以提交 */
      // const indexFilepath = resolve(projectDirpath, outDirInfo.dir, "index.d.ts");
      /**dist文件不可以提交，所以自动生成的代码都在dist中，index中只保留对dist的引用 */
      const refsFilePath = resolve(projectDirpath, outDirInfo.dir, "refs.d.ts");
      // const parseToEsmPath = (filepath: string) =>
      //   toPosixPath(path.relative("typings", filepath.slice(0, -path.extname(filepath).length)));
      const parseTypingFileToEsmPath = (filepath: string) =>
        toPosixPath(path.join(outDirInfo.base, filepath.slice(0, -path.extname(filepath).length) + ".d.ts"));
      // const indexFileCodeReg =
      //   /\/\/▼▼▼AUTO GENERATE BY BFSP, DO NOT EDIT▼▼▼[\w\W]+?\/\/▲▲▲AUTO GENERATE BY BFSP, DO NOT EDIT▲▲▲/g;
      // const indexFileSnippet = `//▼▼▼AUTO GENERATE BY BFSP, DO NOT EDIT▼▼▼\n/// <reference path="./dist.d.ts"/>\n//▲▲▲AUTO GENERATE BY BFSP, DO NOT EDIT▲▲▲`;
      const distFileContent =
        `/// ▼▼▼AUTO GENERATE BY BFSP, DO NOT EDIT▼▼▼\n` +
        // `export * from "${parseToEsmPath(bfspUserConfig.exportsDetail.indexFile)}";\n` +
        tsConfig.tsFilesLists.typeFiles
          .toArray()
          .map((filepath) => `/// <reference path="${parseTypingFileToEsmPath(filepath)}" />`)
          .join("\n");

      /// 自动创建的相关文件与代码
      await folderIO.tryInit(resolve(projectDirpath, outDir));
      await fileIO.set(refsFilePath, Buffer.from(distFileContent));
      // const indexFileContent = (await fileIO.has(indexFilepath)) ? (await fileIO.get(indexFilepath)).toString() : "";

      // if (indexFileContent.match(indexFileCodeReg)?.[0] !== indexFileSnippet) {
      //   // @todo 可能使用语法分析来剔除这个import会更好一些
      //   // @todo 需要进行fmt
      //   await fileIO.set(
      //     indexFilepath,
      //     Buffer.from(indexFileSnippet + "\n\n" + indexFileContent.replace(indexFileCodeReg, "").trimStart())
      //   );
      // }
    })(),
  ]);
};

export const watchTsConfig = (
  projectDirpath: string,
  bfspUserConfigStream: SharedAsyncIterable<$BfspUserConfig>,
  options: {
    tsConfigInitPo?: BFChainUtil.PromiseMaybe<$TsConfig>;
    write?: boolean;
    logger: PKGM.Logger;
  }
) => {
  const { write = false, logger } = options;
  const follower = new SharedFollower<$TsConfig>();
  const sai = new SharedAsyncIterable<$TsConfig>(follower);

  let tsConfig: $TsConfig | undefined;
  let preTsConfig = {} as any;
  /// 循环处理监听到的事件
  const looper = Loopable("watch tsconfigs", async (reasons) => {
    debug("reasons:", reasons);
    const bfspUserConfig = await bfspUserConfigStream.waitCurrent();
    // const tsPathInfo = await multi.getTsConfigPaths(projectDirpath);
    if (tsConfig === undefined) {
      follower.push(
        (tsConfig = await (options.tsConfigInitPo ?? generateTsConfig(projectDirpath, bfspUserConfig, options)))
      );
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
      debug("add", addFileList);
      debug("unlink", removeFileList);

      /// 将变更的文件写入tsconfig中
      if (addFileList.length > 0) {
        groupTsFilesByAdd(projectDirpath, addFileList, tsFilesLists);
      }
      if (removeFileList.length > 0) {
        groupTsFilesByRemove(projectDirpath, removeFileList, tsFilesLists);
      }

      // tsConfig.json.files = tsFilesLists.notestFiles.toArray();
      tsConfig.isolatedJson.files = getTsconfigFiles(tsFilesLists, "isolatedFiles");
      tsConfig.typingsJson.files = getTsconfigFiles(tsFilesLists, "typeFiles");
    }

    /// 生成用户配置
    const userCompilerOptionsBase = _generateUser_CompilerOptionsBase(bfspUserConfig);
    const userReferences = await _generateUser_References(bfspUserConfig);

    tsConfig.json.compilerOptions = {
      ...userCompilerOptionsBase.json,
      outDir: tsConfig.json.compilerOptions.outDir,
      paths: tsFilesLists.profileMap.toTsPaths(bfspUserConfig.userConfig.profiles),
    };
    tsConfig.json.references = userReferences.json;
    tsConfig.isolatedJson.references = userReferences.isolatedJson;

    const newTsConfig = jsonClone({
      json: tsConfig.json,
      isolated: tsConfig.isolatedJson,
      typings: tsConfig.typingsJson,
    });
    if (isDeepStrictEqual(preTsConfig, newTsConfig)) {
      return;
    }
    preTsConfig = newTsConfig;

    if (write) {
      if (!existsSync(projectDirpath)) {
        debug("unable to write tsconfig: project maybe removed");
        return;
      }
      await writeTsConfig(projectDirpath, bfspUserConfig, tsConfig);
    }

    debug("tsconfig changed!!");
    follower.push(tsConfig);
  });
  (async () => {
    const watcher = await getWatcher(projectDirpath, logger);
    const doUnWatch = await watcher.doWatch(
      {
        expression: [
          "allof",
          [
            "anyof",
            ["match", "**/*.ts", "wholename"],
            ["match", "**/*.tsx", "wholename"],
            ["match", "**/*.cts", "wholename"],
            ["match", "**/*.mts", "wholename"],
            ["match", "**/*.ctsx", "wholename"],
            ["match", "**/*.mtsx", "wholename"],
          ],
          ["not", ["match", "**/node_modules/**", "wholename"]],
          ["not", ["match", "build/**", "wholename"]],
          ["not", ["match", "dist/**", "wholename"]],
          ["not", ["match", "**/.*/**", "wholename"]],
        ],
        chokidar: [
          ["assets/**/*.json", "**/*.ts", "**/*.tsx", "**/*.cts", "**/*.mts", "**/*.ctsx", "**/*.mtsx"],
          {
            cwd: projectDirpath,
            ignoreInitial: false,
            followSymlinks: true,
            ignored: ["*.d.ts", ".bfsp", "#bfsp.ts", "node_modules"],
          },
        ],
      },
      async (p, type) => {
        if (await isTsFile(PathInfoParser(projectDirpath, p))) {
          if (type === "change") {
            return;
          }
          debug(`${type} file`, p);
          cachedEventList.set(p, type);
          looper.loop(`${type} file`, 200);
        }
      }
    );
    sai.onStop(doUnWatch);
  })().catch((err) => {
    logger.error("WATCH TS FILES FAIL:", err);
  });

  type EventType = "add" | "unlink";
  let cachedEventList = new Map<string, EventType>();

  //#region 监听依赖配置来触发更新
  bfspUserConfigStream.onNext(() => looper.loop("bfsp user config changed"));
  //#endregion

  /// 初始化，使用400ms时间来进行防抖
  looper.loop("init", 400);
  return sai;
};
