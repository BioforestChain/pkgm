import chalk from "chalk";
import { existsSync, renameSync } from "node:fs";
import { copyFile, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { build as buildBfsp } from "vite";
import { getBfspUserConfig, parseExports, parseFormats } from "../src";
import { writeBfspProjectConfig } from "../src/bfspConfig";
import { BuildService } from "../src/buildService";
import { $PackageJson } from "../src/configs/packageJson";
import { $TsConfig, generateTsConfig, isTestFile, writeTsConfig } from "../src/configs/tsConfig";
import { generateViteConfig } from "../src/configs/viteConfig";
import { consts } from "../src/consts";
import { createTscLogger, createViteLogger, Debug } from "../src/logger";
import { folderIO, toPosixPath, walkFiles } from "../src/toolkit";
import { getTui } from "../src/tui/index";
import { runTerser } from "./terser/runner";
import { runTsc } from "./tsc/runner";
import { writeJsonConfig } from "./util";
import { ViteConfigFactory } from "./vite/configFactory";
import { runYarn } from "./yarn/runner";
const jsonClone = <T>(obj: T) => JSON.parse(JSON.stringify(obj)) as T;
// 任务：生成阶段2的tsconfig，用于es2020到es2019
const taskWriteTsConfigStage2 = async (bundlePath: string, outDir: string, tsConfig: $TsConfig, files: string[]) => {
  const tsconfigJson = jsonClone(tsConfig.json) as typeof tsConfig["json"];

  tsconfigJson.compilerOptions = {
    ...tsconfigJson.compilerOptions,
    composite: false,
    noEmit: false,
    target: "es2019",
    outDir: outDir,
    declaration: false,
  };

  Reflect.deleteProperty(tsconfigJson, "references");

  tsconfigJson.files = files;
  await writeJsonConfig(path.resolve(path.join(bundlePath, "tsconfig.json")), tsconfigJson);

  return tsconfigJson;
};

const taskRenameJsToTs = async (root: string) => {
  const renameFileMap = new Map<string, string>();
  for await (const filepath of walkFiles(root, { refreshCache: true })) {
    if (/\.[mc]?js[x]?$/.test(filepath)) {
      const newFilepath = filepath.replace(/(.*)\.[mc]?js[x]?$/, "$1.ts");
      if (isTestFile("", newFilepath)) {
        continue;
      }
      renameSync(filepath, newFilepath);
      renameFileMap.set(path.relative(root, filepath), path.relative(root, newFilepath));
    }
  }
  return renameFileMap;
};
const taskViteBuild = async (viteBuildConfig: ReturnType<typeof ViteConfigFactory>, opts: { name: string }) => {
  const viteLogger = createViteLogger("info", {});
  await buildBfsp({
    ...viteBuildConfig,
    build: {
      ...viteBuildConfig.build,
      minify: false,
      watch: null,
      rollupOptions: {
        ...viteBuildConfig.build?.rollupOptions,
        onwarn: (err) => viteLogger.warn(chalk.yellow(String(err))),
      },
    },
    logLevel: "warn", // 防止vite干扰tui界面， @todo: 劫持console或者process
    mode: "production",
    customLogger: viteLogger,
  });
  viteLogger.info(`${chalk.green("√")} package ${opts.name} build complete`);
};

export const writeBuildConfigs = async (options: { root?: string; buildService: BuildService }) => {
  const log = Debug("bfsp:bin/build");
  const { root = process.cwd(), buildService } = options;
  const bfspUserConfig = await getBfspUserConfig(root);
  const projectConfig = { projectDirpath: root, bfspUserConfig };
  const subConfigs = await writeBfspProjectConfig(projectConfig, buildService);
  return { subConfigs, bfspUserConfig };
};
export const installBuildDeps = async (options: { root: string }) => {
  const { root } = options;
  const depsPanel = getTui().getPanel("Deps");
  depsPanel.updateStatus("loading");
  const installation = new Promise<boolean>(async (resolve) => {
    runYarn({
      root,
      onMessage: (s) => depsPanel.write(s),
      onExit: () => {
        depsPanel.updateStatus("success");
        resolve(true);
      },
    });
  });
  return await installation;
};

export const runBuildTsc = async (options: { root: string; tscLogger: ReturnType<typeof createTscLogger> }) => {
  const { root, tscLogger } = options;
  const tscCompilation = new Promise<boolean>((resolve) => {
    const tscStoppable = runTsc({
      watch: true,
      tsconfigPath: path.join(root, "tsconfig.json"),
      onMessage: (s) => tscLogger.write(s),
      onClear: () => tscLogger.clear(),
      onSuccess: () => {
        tscStoppable.stop();
        resolve(true);
      },
    });
  });
  return await tscCompilation;
};

/**
 * 修复profile类型路径
 * ```ts
 * import xxx from "#abc"
 * // 修改为
 * import xxx from "./abc#<profile>"
 * ```
 * @param tsConfigPaths tsconfig.compilerOptions.paths
 * @param baseDir typings根路径
 * @param file 需要修改路径的文件
 */
const rePathProfileImports = async (tsConfigPaths: any, baseDir: string, file: string) => {
  const getRealPath = (key: string) => {
    const path1 = path.relative(baseDir, file);
    /**
     * @TODO 这里的import要根据实际的profile来resolve
     */
    const path2 = tsConfigPaths[`#${key}`][0] as string; // 实际指向的路径
    return toPosixPath(path.relative(path.dirname(path1), path2)).replace(/\.ts$/, ""); // trim ending .ts;
  };

  const contents = (await readFile(file)).toString();

  await writeFile(
    file,
    contents
      // import xxx from "#xxx"
      .replace(/(im|ex)port (.*) from "#(.*)"/g, (_, p1, p2, p3) => {
        const p = getRealPath(p3);
        return `${p1}port ${p2} from "${p}"`;
      })
      // import "#xxx"
      .replace(/(im|ex)port "#(.*)"/g, (_, p1, p2) => {
        const p = getRealPath(p2);
        return `${p1}port "${p}"`;
      })
  );
};
export const doBuild = async (options: {
  root?: string;
  format?: Bfsp.Format;
  buildService: BuildService;
  cfgs: Awaited<ReturnType<typeof writeBuildConfigs>>;
}) => {
  const log = Debug("bfsp:bin/build");
  const bundlePanel = getTui().getPanel("Bundle");

  // const cwd = process.cwd();
  // const maybeRoot = path.join(cwd, process.argv.filter((a) => a.startsWith(".")).pop() || "");
  const { root = process.cwd(), format, buildService, cfgs } = options; //fs.existsSync(maybeRoot) && fs.statSync(maybeRoot).isDirectory() ? maybeRoot : cwd;
  const { subConfigs, bfspUserConfig } = cfgs;
  log("root", root);
  const stateReporter = (s: string) => {
    getTui().status.postMsg(s);
  };
  const tscLogger = createTscLogger();
  const viteLogger = createViteLogger();
  const CACHE_BUILD_OUT_ROOT = path.resolve(path.join(root, consts.CacheBuildOutRootPath));
  const BUILD_OUT_ROOT = path.resolve(path.join(root, consts.BuildOutRootPath));
  const TSC_OUT_ROOT = path.resolve(path.join(root, consts.TscOutRootPath));

  const buildSingle = async (options: {
    userConfigBuild: Omit<Bfsp.UserConfig, "build">;
    thePackageJson: $PackageJson;
    buildOutDir: string;
    cacheBuildOutDir: string;
    stateReporter: (s: string) => void;
  }) => {
    const report = options.stateReporter;
    const { userConfigBuild, thePackageJson, buildOutDir, cacheBuildOutDir } = options;
    existsSync(buildOutDir) && (await rm(buildOutDir, { recursive: true, force: true }));

    const userConfig1 = {
      userConfig: userConfigBuild,
      exportsDetail: parseExports(userConfigBuild.exports),
      formatExts: parseFormats(userConfigBuild.formats),
    };
    log(`generate TsConfig\n`);
    const tsConfig1 = await generateTsConfig(root, userConfig1, buildService);
    tsConfig1.isolatedJson.compilerOptions.emitDeclarationOnly = true;
    await writeTsConfig(root, userConfig1, tsConfig1);

    // 生成类型

    report("tsc emit typings");
    const generateTypings = new Promise((resolve) => {
      runTsc({
        tsconfigPath: path.resolve(path.join(root, "tsconfig.isolated.json")),
        projectMode: true,
        onMessage: (x) => {},
        onClear: () => tscLogger.clear(),
        onExit: () => resolve(null),
      });
    });
    await generateTypings;

    log(`generate ViteConfig\n`);
    const viteConfig1 = await generateViteConfig(root, userConfig1, tsConfig1);

    const format = userConfigBuild.formats?.[0] ?? "esm";
    const c = ViteConfigFactory({
      buildService,
      userConfig: userConfigBuild,
      projectDirpath: root,
      viteConfig: viteConfig1,
      tsConfig: tsConfig1,
      format,
      // outDir: bundlePath,
    });
    const defaultOurDir = c.build!.outDir!;
    c.build!.outDir = cacheBuildOutDir;
    report("vite build");
    await taskViteBuild({ ...c, mode: "development" }, { name: userConfigBuild.name }); // vite 打包

    log(`prepare es2020 files for complie to es2019\n`);
    report("prepare es2019");
    const renameFileMap = await taskRenameJsToTs(cacheBuildOutDir); // 改打包出来的文件后缀 js=>ts

    /// 将package.json的types路径进行修改
    const packageJson = jsonClone({
      ...thePackageJson,
      files: ["dist", "source"],
      scripts: undefined,
      devDependencies: undefined,
      ...userConfigBuild.packageJson,
      name: userConfigBuild.name,
    });
    delete packageJson.deps;
    {
      const repathTypePath = (typePath: string) => {
        // const typesPathInfo = path.parse(typePath);
        return typePath.replace(".bfsp/tsc", "source");
        // return toPosixPath(path.join("source/isolated", typePath));
      };
      for (const exportConfig of Object.values(packageJson.exports)) {
        exportConfig.types = repathTypePath(exportConfig.types);
      }
      packageJson.types = repathTypePath(packageJson.types);
    }

    report("compile to es2019");
    log(`complile to es2019\n`);
    // 在打包出来的目录生成tsconfig，主要是为了es2020->es2019

    /**dev默认输出的dist文件夹 */
    const distDir = path.join(buildOutDir, defaultOurDir);
    const files = [...renameFileMap.values()];
    if (files.length === 0) {
      // no files for compilation
      log(`[${userConfigBuild.name}] no files for tsc compilation`);
      return;
    }
    await taskWriteTsConfigStage2(cacheBuildOutDir, distDir, tsConfig1, files);

    // 打包目录执行tsc

    report("tsc compile");
    const buildStage2 = new Promise((resolve) => {
      runTsc({
        tsconfigPath: path.resolve(path.join(cacheBuildOutDir, "tsconfig.json")),
        projectMode: true,
        onMessage: (x) => {},
        onClear: () => tscLogger.clear(),
        onExit: () => resolve(null),
      });
    });
    await buildStage2;

    log(`writing package.json\n`);

    /// 写入package.json
    await writeJsonConfig(path.join(buildOutDir, "package.json"), packageJson);

    /// 执行代码压缩
    report("minify");
    log(`minify ${chalk.cyan(userConfigBuild.name)}\n`);
    await runTerser({ sourceDir: distDir, logError: (s) => tscLogger.write(s) }); // 压缩
    // tscLogger.write(`built ${chalk.cyan(userConfigBuild.name)} [${format}] at ${chalk.blue(buildOutDir)}\n`);

    report("rename");
    /// 最后再将js文件的后缀换回去
    for (const [jsFilename, tsFilename] of renameFileMap) {
      renameSync(path.join(distDir, tsFilename.slice(0, -2) + "js"), path.join(distDir, jsFilename));
    }
    log("rename done\n");

    report("done");
    /// 修改样式
    tscLogger.updateStatus("success");
    bundlePanel.updateStatus("success");
    return tsConfig1;
  };

  const reporter = stateReporter;
  const userConfig = bfspUserConfig;
  const thePackageJson = subConfigs.packageJson;
  log("running bfsp build!");

  try {
    /// tsc验证没问题，开始执行vite打包

    const buildUserConfigs = userConfig.userConfig.build
      ? userConfig.userConfig.build.map((build) => {
          const ret = {
            ...userConfig.userConfig,
            ...build,
          };
          Reflect.deleteProperty(ret, "build");
          return ret;
        })
      : [userConfig.userConfig];
    for (const buildConfig of buildUserConfigs.slice()) {
      if (buildConfig.formats !== undefined && buildConfig.formats.length > 1) {
        const singleFormatConfigs = buildConfig.formats.map((format) => ({
          ...buildConfig,
          formats: [format],
        }));
        buildUserConfigs.splice(buildUserConfigs.indexOf(buildConfig), 1, ...singleFormatConfigs);
      }
    }

    const buildOutDirs = new Set<string>();
    let i = 0;
    for (const x of buildUserConfigs) {
      i++;

      log(`start build task: ${i}/${buildUserConfigs.length}\n`);
      log(`removing bundleOutRoot: ${CACHE_BUILD_OUT_ROOT}\n`);
      const userConfigBuild = x;

      const buildOutDir = path.resolve(BUILD_OUT_ROOT, userConfigBuild.name);
      const cacheBuildOutDir = path.resolve(CACHE_BUILD_OUT_ROOT, userConfigBuild.name);
      // 状态报告给外层，由外层组装后写入状态栏
      const singleReporter = (s: string) => {
        reporter(`${x.name} > ${s}`);
      };
      bundlePanel.updateStatus("loading");
      const tsConfig = await buildSingle({
        userConfigBuild,
        thePackageJson,
        buildOutDir,
        cacheBuildOutDir,
        stateReporter: singleReporter,
      });
      await buildService.afterSingleBuild({ buildOutDir, config: x });

      const tscOutRoot = TSC_OUT_ROOT;
      for await (const filepath of walkFiles(tscOutRoot, { refreshCache: true })) {
        if (filepath.endsWith(".d.ts") && filepath.endsWith(".test.d.ts") === false) {
          const destFilepath = path.join(buildOutDir, "source", path.relative(tscOutRoot, filepath));
          await folderIO.tryInit(path.dirname(destFilepath));
          await copyFile(filepath, destFilepath);
          await rePathProfileImports(
            tsConfig?.json.compilerOptions.paths,
            path.join(buildOutDir, "source/isolated"),
            destFilepath
          );
        }
      }

      buildOutDirs.add(buildOutDir);
    }
  } catch (e) {
    viteLogger.error(e as any);
  }
};
