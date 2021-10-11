import { walkFiles, notGitIgnored, folderIO, toPosixPath } from "../toolkit";
import path from "node:path";

// import type {} from "typescript";
export const generateTsConfig = async (
  projectDirpath: string,
  config?: Bfsp.UserConfig
) => {
  const allTsFileList = await walkFiles(projectDirpath, (dirpath) =>
    notGitIgnored(dirpath)
  )
    .filter((filepath) => {
      return (
        (filepath.endsWith(".ts") ||
          filepath.endsWith(".tsx") ||
          filepath.endsWith(".cts") ||
          filepath.endsWith(".mts") ||
          filepath.endsWith(".ctsx") ||
          filepath.endsWith(".mtsx")) &&
        !filepath.endsWith("#bfsp.ts") &&
        !filepath.endsWith(".d.ts") &&
        notGitIgnored(filepath) /* promise<boolean> */
      );
    })
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
    files: allTsFileList.filter((file) => {
      if (!file.endsWith(".type.ts") && !file.startsWith("typings/")) {
        return true;
      }
      allTypesFileList.push(file);
      return false;
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
    tsFileList: allTsFileList,
    typesFileList: allTypesFileList,
    tsConfig,
    tsProdConfig,
  };
};

export type $TsConfig = BFChainUtil.PromiseReturnType<typeof generateTsConfig>;
import { resolve } from "node:path";
import { fileIO } from "../toolkit";
export const writeTsConfig = (projectDirpath: string, config: $TsConfig) => {
  console.log("write to tsconfig", config.tsFileList);
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
      if (config.typesFileList.length === 0) {
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
            config.typesFileList
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
