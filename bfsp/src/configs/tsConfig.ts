import chokidar from "chokidar";
import path, { resolve } from "node:path";
import { debug } from "../logger";
import {
  $PathInfo,
  fileIO,
  folderIO,
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
const log = debug("bfsp:config/tsconfig.json");

export const isTsFile = (filepathInfo: $PathInfo) => {
  const { relative } = filepathInfo;
  return (
    /// 在assets文件夹下的json文件
    ((relative.endsWith(".json") && toPosixPath(filepathInfo.relative).startsWith("./assets/")) ||
      /// ts文件
      (relative.endsWith(".ts") && !relative.endsWith(".d.ts") && !relative.endsWith("#bfsp.ts")) ||
      relative.endsWith(".tsx") ||
      relative.endsWith(".cts") ||
      relative.endsWith(".mts") ||
      relative.endsWith(".ctsx") ||
      relative.endsWith(".mtsx")) &&
    /// promise<boolean>
    notGitIgnored(filepathInfo.full)
  );
};

export const isTypeFile = (projectDirpath: string, filepath: string) =>
  filepath.endsWith(".type.ts") || filepath.startsWith("./typings/");

export const isTestFile = (projectDirpath: string, filepath: string) =>
  filepath.startsWith("./tests/") && (filepath.endsWith(".test.ts") || filepath.endsWith(".bm.ts"));

export const isBinFile = (projectDirpath: string, filepath: string) => {
  return filepath.startsWith("./bin/") && (filepath.endsWith(".cmd.ts") || filepath.endsWith(".tui.ts"));
};

type TsFilesLists = {
  allFiles: List<string>;
  codeFiles: List<string>;
  prodFiles: List<string>;
  typeFiles: List<string>;
  testFiles: List<string>;
  binFiles: List<string>;
};
export const groupTsFilesByAdd = (projectDirpath: string, tsFiles: Iterable<string>, lists: TsFilesLists) => {
  for (const filepath of tsFiles) {
    lists.allFiles.add(filepath);

    if (isTypeFile(projectDirpath, filepath)) {
      lists.typeFiles.add(filepath);
    } else {
      lists.codeFiles.add(filepath);
    }

    if (isTestFile(projectDirpath, filepath)) {
      lists.testFiles.add(filepath);
    } else {
      lists.prodFiles.add(filepath);
    }

    if (isBinFile(projectDirpath, filepath)) {
      lists.binFiles.add(filepath);
    }
  }
};
export const groupTsFilesByRemove = (projectDirpath: string, tsFiles: Iterable<string>, lists: TsFilesLists) => {
  for (const filepath of tsFiles) {
    lists.allFiles.remove(filepath);

    if (isTypeFile(projectDirpath, filepath)) {
      lists.typeFiles.remove(filepath);
    } else {
      lists.codeFiles.remove(filepath);
    }

    if (isTestFile(projectDirpath, filepath)) {
      lists.testFiles.remove(filepath);
    } else {
      lists.prodFiles.remove(filepath);
    }

    if (isBinFile(projectDirpath, filepath)) {
      lists.binFiles.remove(filepath);
    }
  }
};

export const generateTsConfig = async (projectDirpath: string, bfspUserConfig: $BfspUserConfig) => {
  const allTsFileList = await walkFiles(projectDirpath, (fullDirpath) => notGitIgnored(fullDirpath))
    .map((fullFilepath) => PathInfoParser(projectDirpath, fullFilepath, true))
    .filter((pathInfo) => isTsFile(pathInfo))
    .map((pathInfo) => toPosixPath(pathInfo.relative))
    .toArray();

  const tsFilesLists = {
    allFiles: new ListSet(allTsFileList),
    codeFiles: new ListArray<string>(),
    prodFiles: new ListArray<string>(),
    typeFiles: new ListSet<string>(),
    testFiles: new ListSet<string>(),
    binFiles: new ListSet<string>(),
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
      outDir: "./node_modules/.bfsp/",
      importHelpers: true,
      isolatedModules: true,
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
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
    },
    references: [
      {
        path: "./tsconfig.prod.json",
      },
    ],
    files: tsFilesLists.codeFiles.toArray(),
  };
  const tsProdConfig = {
    extends: "./tsconfig.json",
    compilerOptions: {
      isolatedModules: false,
      outDir: "./node_modules/.bfsp/tsc",
      noEmit: false,
    },
    files: tsFilesLists.prodFiles.toArray(),
    references: [],
  };

  return {
    tsFilesLists,

    tsConfig,
    tsProdConfig,
  };
};

export type $TsConfig = BFChainUtil.PromiseReturnType<typeof generateTsConfig>;
export const writeTsConfig = (projectDirpath: string, bfspUserConfig: $BfspUserConfig, tsConfig: $TsConfig) => {
  return Promise.all([
    fileIO.set(resolve(projectDirpath, "tsconfig.json"), Buffer.from(JSON.stringify(tsConfig.tsConfig, null, 2))),
    fileIO.set(
      resolve(projectDirpath, "tsconfig.prod.json"),
      Buffer.from(JSON.stringify(tsConfig.tsProdConfig, null, 2))
    ),
    (async () => {
      const indexFilepath = resolve(projectDirpath, "typings/@index.d.ts");
      const typesFilepath = resolve(projectDirpath, "typings/@types.d.ts");
      const parseToEsmPath = (filepath: string) =>
        toPosixPath(path.relative("typings", filepath.slice(0, -path.extname(filepath).length)));
      // const indexFileCodeReg =
      //   /\/\/▼▼▼AUTO GENERATE BY BFSP, DO NOT EDIT▼▼▼[\w\W]+?\/\/▲▲▲AUTO GENERATE BY BFSP, DO NOT EDIT▲▲▲/g;
      const indexFileSnippet = `//▼▼▼AUTO GENERATE BY BFSP, DO NOT EDIT▼▼▼\nimport "./@types.d.ts";\n//▲▲▲AUTO GENERATE BY BFSP, DO NOT EDIT▲▲▲`;
      const typesFileSnippet =
        `/// ▼▼▼AUTO GENERATE BY BFSP, DO NOT EDIT▼▼▼\n` +
        `export * from "${parseToEsmPath(bfspUserConfig.exportsDetail.indexFile)}";\n` +
        tsConfig.tsFilesLists.typeFiles
          .toArray()
          .map((filepath) => `import "${parseToEsmPath(filepath)}"`)
          .join(";\n");

      /// 自动创建的相关文件与代码
      await folderIO.tryInit(resolve(projectDirpath, "typings"));
      await fileIO.set(typesFilepath, Buffer.from(typesFileSnippet));
      const indexFileContent = (await fileIO.has(indexFilepath)) ? (await fileIO.get(indexFilepath)).toString() : "";

      if (indexFileContent.includes(indexFileSnippet) === false) {
        // @todo 可能使用语法分析来剔除这个import会更好一些
        // @todo 需要进行fmt
        await fileIO.set(indexFilepath, Buffer.from(indexFileSnippet + "\n\n" + indexFileContent));
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
  /// 循环处理监听到的事件
  const looper = Loopable("watch tsconfigs", async () => {
    const bfspUserConfig = await bfspUserConfigStream.getCurrent();
    if (tsConfig === undefined) {
      follower.push((tsConfig = await (options.tsConfigInitPo ?? generateTsConfig(projectDirpath, bfspUserConfig))));
    }

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

      if (addFileList.length > 0) {
        groupTsFilesByAdd(projectDirpath, addFileList, tsConfig.tsFilesLists);
      }
      if (removeFileList.length > 0) {
        groupTsFilesByRemove(projectDirpath, removeFileList, tsConfig.tsFilesLists);
      }

      if (write) {
        await writeTsConfig(projectDirpath, bfspUserConfig, tsConfig);
      }

      log("tsconfig changed!!");
      follower.push(tsConfig);
    }
  });

  //#region 监听文件变动来触发更新
  const watcher = chokidar.watch(
    ["assets/**/*.json", "**/*.ts", "**/*.tsx", "**/*.cts", "**/*.mts", "**/*.ctsx", "**/*.mtsx"],
    {
      cwd: projectDirpath,
      ignoreInitial: false,
      followSymlinks: true,
      ignored: ["*.d.ts", "#bfsp.ts", "node_modules"],
    }
  );

  type EventType = "add" | "unlink";
  let cachedEventList = new Map<string, EventType>();
  /// 收集监听到事件
  watcher.on("add", async (path) => {
    if (await isTsFile(PathInfoParser(projectDirpath, path))) {
      cachedEventList.set(path, "add");
      looper.loop();
    }
  });
  watcher.on("unlink", async (path) => {
    if (await isTsFile(PathInfoParser(projectDirpath, path))) {
      cachedEventList.set(path, "unlink");
      looper.loop();
    }
  });
  //#endregion

  //#region 监听依赖配置来触发更新
  bfspUserConfigStream.onNext(looper.loop);
  //#endregion

  looper.loop();
  return new SharedAsyncIterable<$TsConfig>(follower);
};
