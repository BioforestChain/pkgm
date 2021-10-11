import { walkFiles, notGitIgnored, folderIO, toPosixPath } from "../toolkit";
import path from "node:path";

export const isTsFile = (projectDirpath: string, filepath: string) =>
  /// 在assets文件夹下的json文件
  ((filepath.endsWith(".json") &&
    toPosixPath(path.relative(projectDirpath, filepath)).startsWith(
      "assets/"
    )) ||
    /// ts文件
    (filepath.endsWith(".ts") &&
      !filepath.endsWith(".d.ts") &&
      !filepath.endsWith("#bfsp.ts")) ||
    filepath.endsWith(".tsx") ||
    filepath.endsWith(".cts") ||
    filepath.endsWith(".mts") ||
    filepath.endsWith(".ctsx") ||
    filepath.endsWith(".mtsx")) &&
  /// promise<boolean>
  notGitIgnored(filepath);

const isTypeFile = (projectDirpath: string, filepath: string) =>
  filepath.endsWith(".type.ts") || filepath.startsWith("typings/");

export const generateTsConfig = async (
  projectDirpath: string,
  config?: Bfsp.UserConfig
) => {
  const allTsFileList = await walkFiles(projectDirpath, (dirpath) =>
    notGitIgnored(dirpath)
  )
    .filter((filepath) => isTsFile(projectDirpath, filepath))
    .map((filepath) => toPosixPath(path.relative(projectDirpath, filepath)))
    .toArray();

  const allTypesFileList: string[] = [];
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
      baseUrl: "./",
      types: ["node"],
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
    },
    references: [
      {
        path: "./tsconfig.prod.json",
      },
    ],
    files: allTsFileList.filter((filepath) => {
      if (isTypeFile(projectDirpath, filepath)) {
        allTypesFileList.push(filepath);
        return false;
      }
      return true;
    }),
  };
  const tsProdConfig = {
    extends: "./tsconfig.json",
    compilerOptions: {
      isolatedModules: false,
      outDir: "./node_modules/.bfsp/tsc",
      noEmit: false,
    },
    files: allTsFileList,
    references: [],
  };

  return {
    tsFiles: new Set(allTsFileList),
    typesFiles: new Set(allTypesFileList),
    tsConfig,
    tsProdConfig,
  };
};

export type $TsConfig = BFChainUtil.PromiseReturnType<typeof generateTsConfig>;
import { resolve } from "node:path";
import { fileIO } from "../toolkit";
export const writeTsConfig = (projectDirpath: string, config: $TsConfig) => {
  console.log("write to tsconfig", config.tsFiles, config.typesFiles);

  return Promise.all([
    fileIO.set(
      resolve(projectDirpath, "tsconfig.json"),
      Buffer.from(JSON.stringify(config.tsConfig, null, 2))
    ),
    fileIO.set(
      resolve(projectDirpath, "tsconfig.prod.json"),
      Buffer.from(JSON.stringify(config.tsProdConfig, null, 2))
    ),
    (async () => {
      const indexFilepath = resolve(projectDirpath, "typings/@index.d.ts");
      const typesFilepath = resolve(projectDirpath, "typings/@types.d.ts");
      const indexFileCode = `//▼▼▼AUTO GENERATE BY BFSP, DO NOT EDIT▼▼▼\nimport "./@types.d.ts";\n//▲▲▲AUTO GENERATE BY BFSP, DO NOT EDIT▲▲▲`;
      if (config.typesFiles.size === 0) {
        if (await fileIO.has(typesFilepath)) {
          await fileIO.del(typesFilepath);
          if (await fileIO.has(indexFilepath)) {
            const indexFileContent = (
              await fileIO.get(indexFilepath)
            ).toString();

            // @todo 可能使用语法分析来剔除这个import会更好一些
            // @todo 需要进行fmt
            await fileIO.set(
              indexFilepath,
              Buffer.from(indexFileContent.replace(indexFileCode, ""))
            );
          }
        }
      } else {
        await folderIO.tryInit(resolve(projectDirpath, "typings"));
        await fileIO.set(
          typesFilepath,
          Buffer.from(
            [...config.typesFiles]
              .map(
                (filepath) =>
                  `import "${toPosixPath(path.relative("typings", filepath))}"`
              )
              .join(";\n")
          )
        );
        const indexFileContent = (await fileIO.has(indexFilepath))
          ? (await fileIO.get(indexFilepath)).toString()
          : "";
        if (indexFileContent.includes(indexFileCode) === false) {
          // @todo 可能使用语法分析来剔除这个import会更好一些
          // @todo 需要进行fmt
          await fileIO.set(
            indexFilepath,
            Buffer.from(indexFileContent + `\n${indexFileCode}`.trim())
          );
        }
      }
    })(),
  ]);
};

import chokidar from "chokidar";

export const watchTsConfig = (
  projectDirpath: string,
  configPo: BFChainUtil.PromiseMaybe<$TsConfig>
) => {
  const watcher = chokidar.watch(
    [
      "assets/**/*.json",
      "**/*.ts",
      "**/*.tsx",
      "**/*.cts",
      "**/*.mts",
      "**/*.ctsx",
      "**/*.mtsx",
    ],
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
  watcher.on("add", (path) => {
    cachedEventList.set(path, "add");
    loopProcesser();
  });
  watcher.on("unlink", (path) => {
    cachedEventList.set(path, "unlink");
    loopProcesser();
  });

  /// 循环处理监听到的事件
  let running = false;
  const loopProcesser = async () => {
    if (running) {
      return;
    }
    running = true;
    try {
      const config = (configPo = await configPo);
      while (cachedEventList.size !== 0) {
        // 保存一份,清空缓存
        const eventList = new Map(cachedEventList);
        cachedEventList.clear();

        for (const [path, type] of eventList) {
          const posixPath = toPosixPath(path);
          if (type === "add") {
            if (config.tsFiles.has(posixPath)) {
              return;
            }
            config.tsFiles.add(posixPath);
            if (isTypeFile(projectDirpath, posixPath)) {
              config.typesFiles.add(posixPath);
            }
          } else {
            if (config.tsFiles.has(posixPath) === false) {
              return;
            }
            config.tsFiles.delete(posixPath);
            if (isTypeFile(projectDirpath, posixPath)) {
              config.typesFiles.delete(posixPath);
            }
          }
          console.log(type, path);

          const allTsFileList = [...config.tsFiles];
          config.tsConfig.files = allTsFileList.filter((filepath) => {
            return !config.typesFiles.has(filepath);
          });
          config.tsProdConfig.files = allTsFileList;
          await writeTsConfig(projectDirpath, config);
        }
      }
    } finally {
      running = false;
    }
  };
};
