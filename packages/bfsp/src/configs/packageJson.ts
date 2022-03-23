import { existsSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import packageJsonTemplate from "../../assets/package.template.json?raw";
import { getBfspVersion, writeJsonConfig } from "../../bin/util";
import { DevLogger } from "../logger";
import { jsonClone, Loopable, SharedAsyncIterable, SharedFollower, toPosixPath } from "../toolkit";
import type { $BfspUserConfig } from "./bfspUserConfig";
import { $TsConfig } from "./tsConfig";
const debug = DevLogger("bfsp:config/package.json");
// const format

export const generatePackageJson = async (
  projectDirpath: string,
  bfspUserConfig: $BfspUserConfig,
  tsConfig: $TsConfig,
  options: {
    customTypesRoot?: string;
    packageTemplateJson?: {};
  } = {}
) => {
  const packageJson = options.packageTemplateJson
    ? jsonClone(options.packageTemplateJson)
    : JSON.parse(packageJsonTemplate);
  packageJson.name = bfspUserConfig.userConfig.name;
  const { exportsMap } = bfspUserConfig.exportsDetail;

  const { formatExts } = bfspUserConfig;
  const hasCjs = formatExts.find((fe) => fe.format === "cjs");
  const hasEsm = formatExts.find((fe) => fe.format === "esm");
  const hasIife = formatExts.find((fe) => fe.format === "iife");
  const defaultFormat = formatExts[0];

  const getDistFilepath = (format: Bfsp.JsFormat, outputName: string): string | undefined => {
    let fe = hasIife || defaultFormat;
    switch (format) {
      case "cjs":
        if (hasCjs !== undefined) {
          fe = hasCjs;
        }
        break;
      case "esm":
        if (hasEsm !== undefined) {
          fe = hasEsm;
        }
        break;
      case "iife":
        if (hasIife !== undefined) {
          fe = hasIife;
        }
        break;
    }
    return toPosixPath(path.join(`dist/${fe.format}`, `${outputName}${fe.extension}`));
  };

  const packageJsonKeys = new Set<string>();
  //#region exports 导出
  packageJson.exports = {};
  for (const [posixKey, input] of Object.entries(bfspUserConfig.exportsDetail.formatedExports)) {
    const output = exportsMap.getOutput(input);
    if (output === undefined) {
      console.error(`no found output by input: '${input}'`);
      continue;
    }
    packageJson.exports[posixKey[0] === "." ? posixKey : `./${posixKey}`] = {
      require: getDistFilepath("cjs", output),
      import: getDistFilepath("esm", output),
      types: toPosixPath(
        path.join(
          options.customTypesRoot ?? tsConfig.isolatedJson.compilerOptions.outDir,
          input.replace(/\.ts$/, ".d.ts")
        )
      ),
      // types: `./${toPosixPath(path.join("./", input.replace(/\.ts$/, ".d.ts")))}`,
    };
  }
  const defaultExportConfig = packageJson.exports["."];
  if (defaultExportConfig !== undefined) {
    packageJson.main = packageJson.exports["."][defaultFormat.format === "esm" ? "import" : "require"];
    packageJson.types = packageJson.exports["."].types; // viteConfig.mainEntry;
  }
  packageJsonKeys.add("exports");
  //#endregion

  //#region typesVersions
  const typesVersionsEntries: { [index: string]: string[] } = {};
  for (const [key, exportEntry] of Object.entries(packageJson.exports)) {
    if (key === ".") {
      continue;
    }
    const trimedKey = key.substring(2); // removes './'
    typesVersionsEntries[trimedKey] = [(exportEntry as any).types];
  }
  if (Object.keys(typesVersionsEntries).length > 0) {
    packageJson.typesVersions = {
      "*": typesVersionsEntries,
    };
  }
  packageJsonKeys.add("typesVersions");
  //#endregion

  //#region bin 导出

  if (tsConfig.tsFilesLists.binFiles.size === 0) {
    packageJson.bin = undefined;
  } else {
    packageJson.bin = {};
  }
  for (const bin of tsConfig.tsFilesLists.binFiles) {
    const binName = path.basename(bin).split(".").slice(0, -2 /* rm .bin .ts */).join(".");

    const outputFilename = exportsMap.getOutput(bin);
    if (outputFilename === undefined) {
      console.error(`no found output file for bin '${bin}'`);
      continue;
    }
    packageJson.bin[binName] = toPosixPath(path.join(`dist/esm`, `${outputFilename}.mjs`));
  }
  packageJsonKeys.add("bin");
  //#endregion

  // 版本
  const userConfigPackageJson = bfspUserConfig.userConfig.packageJson ?? {};
  if (typeof userConfigPackageJson.version === "string") {
    packageJson.version = userConfigPackageJson.version;
  }
  packageJsonKeys.add("version");

  // 依赖
  packageJson.dependencies = Object.assign(
    //
    {},
    packageJson.dependencies,
    userConfigPackageJson.dependencies
  );
  packageJsonKeys.add("dependencies");

  packageJson.devDependencies = Object.assign(
    //
    {},
    packageJson.devDependencies,
    userConfigPackageJson.devDependencies
  );
  packageJsonKeys.add("devDependencies");

  packageJson.optionalDependencies = Object.assign(
    {},
    packageJson.optionalDependencies,
    userConfigPackageJson.optionalDependencies
  );
  packageJsonKeys.add("optionalDependencies");

  packageJson.peerDependencies = Object.assign(
    {},
    packageJson.peerDependencies,
    userConfigPackageJson.peerDependencies
  );
  packageJsonKeys.add("peerDependencies");

  /// 合并剩余的 key
  for (const key in userConfigPackageJson) {
    if (packageJsonKeys.has(key)) {
      continue;
    }
    packageJson[key] = userConfigPackageJson[key];
  }

  return packageJson as $PackageJson;
};

export type $PackageJson = typeof import("../../assets/package.template.json") & {
  dependencies: Bfsp.Dependencies;
  devDependencies: Bfsp.Dependencies;
  peerDependencies: Bfsp.Dependencies;
  optionalDependencies: Bfsp.Dependencies;
};
export const writePackageJson = (projectDirpath: string, packageJson: $PackageJson) => {
  return writeJsonConfig(path.resolve(projectDirpath, "package.json"), packageJson);
};
export const watchPackageJson = (
  projectDirpath: string,
  bfspUserConfigStream: SharedAsyncIterable<$BfspUserConfig>,
  tsConfigStream: SharedAsyncIterable<$TsConfig>,
  options: {
    write?: boolean;
    packageJsonInitPo?: BFChainUtil.PromiseMaybe<$PackageJson>;
  } = {}
) => {
  const follower = new SharedFollower<$PackageJson>();
  const { write = false } = options;

  let curPackageJson: $PackageJson | undefined;
  const looper = Loopable("watch package.json", async () => {
    if (curPackageJson === undefined && options.packageJsonInitPo !== undefined) {
      curPackageJson = await options.packageJsonInitPo;
      follower.push(curPackageJson);
    }

    const bfspUserConfig = await bfspUserConfigStream.getCurrent();
    const tsConfig = await tsConfigStream.getCurrent();
    const newPackageJson = await generatePackageJson(projectDirpath, bfspUserConfig, tsConfig);
    if (isDeepStrictEqual(newPackageJson, curPackageJson)) {
      return;
    }
    if (write) {
      if (!existsSync(projectDirpath)) {
        debug.error("unable to write package.json: project maybe removed");
        return;
      }
      await writePackageJson(projectDirpath, newPackageJson);
    }
    debug("packageJson changed");
    follower.push((curPackageJson = newPackageJson));
  });

  //#region 监听变更
  bfspUserConfigStream.onNext(looper.loop);
  tsConfigStream.onNext(looper.loop);
  //#endregion

  looper.loop();
  return new SharedAsyncIterable<$PackageJson>(follower);
};
