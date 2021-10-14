import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import packageJsonTemplate from "../../assets/package.template.json?raw";
import { fileIO, getExtensionByFormat, Loopable, SharedAsyncIterable, SharedFollower, toPosixPath } from "../toolkit";
import type { $BfspUserConfig } from "./bfspUserConfig";
import { $TsConfig } from "./tsConfig";
import debug from "debug";
const log = debug("bfsp:config/package.json");
// const format

export const generatePackageJson = async (
  projectDirpath: string,
  bfspUserConfig: $BfspUserConfig,
  tsConfig: $TsConfig
) => {
  const packageJson = JSON.parse(packageJsonTemplate);
  packageJson.name = bfspUserConfig.userConfig.name;
  const { exportsMap } = bfspUserConfig.exportsDetail;
  const indexOutput = exportsMap.getOutput(bfspUserConfig.exportsDetail.indexFile)!;

  const { formats } = bfspUserConfig;
  const hasCjs = formats.includes("cjs");
  const hasEsm = formats.includes("esm");
  const hasIife = formats.includes("iife");
  const defaultFormat = formats[0];

  const getDistFilepath = (format: Bfsp.Format, outputName: string): string | undefined => {
    if (format === "cjs" && hasCjs === false) {
      return getDistFilepath("iife", outputName);
    }
    if (format === "esm" && hasEsm === false) {
      return getDistFilepath("iife", outputName);
    }
    if (format === "iife" && hasIife === false) {
      return;
    }
    return toPosixPath(path.join(`dist/${format}`, `${outputName}${getExtensionByFormat(format)}`));
  };

  packageJson.types = `typings/@index.d.ts`; // viteConfig.mainEntry;

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
    };
  }
  packageJson.main = packageJson.exports["."][defaultFormat === "esm" ? "import" : "require"];
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

  return packageJson as typeof import("../../assets/package.template.json");
};

export type $PackageJson = BFChainUtil.PromiseReturnType<typeof generatePackageJson>;
export const writePackageJson = (projectDirpath: string, packageJson: $PackageJson) => {
  return fileIO.set(path.resolve(projectDirpath, "package.json"), Buffer.from(JSON.stringify(packageJson, null, 2)));
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
  const looper = Loopable('watch package.json',async () => {
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
