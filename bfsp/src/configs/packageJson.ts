import { existsSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import packageJsonTemplate from "../../assets/package.template.json?raw";
import { writeJsonConfig } from "../../bin/util";
import { Debug } from "../logger";
import {
  fileIO,
  parseExtensionAndFormat,
  getExtname,
  Loopable,
  SharedAsyncIterable,
  SharedFollower,
  toPosixPath,
} from "../toolkit";
import type { $BfspUserConfig } from "./bfspUserConfig";
import { $TsConfig } from "./tsConfig";
const log = Debug("bfsp:config/package.json");
// const format

export const generatePackageJson = async (
  projectDirpath: string,
  bfspUserConfig: $BfspUserConfig,
  tsConfig: $TsConfig
) => {
  const packageJson = JSON.parse(packageJsonTemplate);
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
      types: input,
    };
  }
  const defaultExportConfig = packageJson.exports["."];
  if (defaultExportConfig !== undefined) {
    packageJson.main = packageJson.exports["."][defaultFormat.format === "esm" ? "import" : "require"];
    packageJson.types = packageJson.exports["."].types; // viteConfig.mainEntry;
  }
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
  //#endregion

  // 版本
  const version = bfspUserConfig.userConfig.packageJson?.version;
  if (version) {
    packageJson.version = version;
  }

  // 依赖
  const deps = bfspUserConfig.userConfig.packageJson?.deps;
  if (deps) {
    // @fixme: 不知道为啥yarn不会自动安装DevDependencies里的内容
    packageJson.dependencies = Object.assign({}, packageJson.dependencies, deps);
  }

  return packageJson as typeof import("../../assets/package.template.json");
};

export type $PackageJson = BFChainUtil.PromiseReturnType<typeof generatePackageJson>;
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
        log("unable to write package.json: project maybe removed");
        return;
      }
      await writePackageJson(projectDirpath, newPackageJson);
    }
    log("packageJson changed");
    follower.push((curPackageJson = newPackageJson));
  });

  //#region 监听变更
  bfspUserConfigStream.onNext(looper.loop);
  tsConfigStream.onNext(looper.loop);
  //#endregion

  looper.loop();
  return new SharedAsyncIterable<$PackageJson>(follower);
};
