import chalk from "chalk";
import { existsSync, mkdirSync } from "node:fs";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { Worker } from "node:worker_threads";
import { build as buildBfsp } from "vite";
import { fileIO, getExtensionByFormat } from "../src";
import { $BfspProjectConfig, getBfspProjectConfig, writeBfspProjectConfig } from "../src/bfspConfig";
import { generatePackageJson } from "../src/configs/packageJson";
import { $TsConfig, generateTsConfig } from "../src/configs/tsConfig";
import { generateViteConfig } from "../src/configs/viteConfig";
import { createDevTui, Debug } from "../src/logger";
import { ViteConfigFactory } from "./vite-build-config-factory";

const log = Debug("bfsp:bin/build");
const { createTscLogger, createViteLogger } = createDevTui();

const viteLogger = createViteLogger("info", {});
export const doBuild = async (options: { root?: string; format?: Bfsp.Format; profiles?: string[] }) => {
  /**
   * 1. 按照要求使用tsc验证
   * 2. vite执行打包
   * 3. 根据Profiles生成配置文件( node=>package.json, web=>manifest or (none) )
   *    当前只区分node和web，因为没有类似platform/runtime的字段，所以用profile关键字作区分
   * 3.1 针对每个包含node/web关键字的profile做打包，输出到dist/{profile}下
   */

  const { profiles } = options;
  if (!profiles) {
    return;
  }

  let format = options.format;
  const { root = process.cwd() } = options;
  log("root", root);
  const config = await getBfspProjectConfig(root);
  const tsConfig = await generateTsConfig(config.projectDirpath, config.bfspUserConfig);
  tsConfig.json.compilerOptions.target = "es2019";
  tsConfig.json.compilerOptions.module = "es2019";

  const viteConfig = await generateViteConfig(config.projectDirpath, config.bfspUserConfig, tsConfig);

  const results: { profile: string; path: string }[] = []; // 统计打包结果输出到日志面板

  for (const x of profiles) {
    // platform coercion
    let platform: "web" | "node" | "unknown" = "unknown";
    if (x.indexOf("node") >= 0) {
      platform = "node";
      format = format || "cjs";
    } else if (x.indexOf("web") >= 0) {
      platform = "web";
      format = "iife";
    }

    // build
    const baseOutDir = path.join(config.projectDirpath, "dist", x, config.bfspUserConfig.userConfig.name);
    const outDir = path.join(baseOutDir);
    const viteConfigBuildOptions = {
      projectDirpath: config.projectDirpath,
      viteConfig,
      tsConfig,
      format,
      outDir,
    };
    await doBuildInternal({ config, viteConfigBuildOptions });

    // platform specific
    if (platform === "node") {
      const packageJson = await generatePackageJson(config.projectDirpath, config.bfspUserConfig, tsConfig);
      packageJson.main = `${format}/index${getExtensionByFormat(format!)}`;
      delete (packageJson as any).scripts;
      const fileName = path.join(baseOutDir, "package.json");

      if (!existsSync(outDir)) {
        mkdirSync(outDir, { recursive: true });
      }
      fileIO.set(fileName, Buffer.from(JSON.stringify(packageJson, null, 2)));
    }
    results.push({ profile: x, path: baseOutDir });
  }

  results
    .sort((x, y) => x.profile.localeCompare(y.profile))
    .forEach((x) => {
      viteLogger.info(`${chalk.cyan(x.profile)} bundled at: ${x.path}`);
    });
};
const doBuildInternal = async (options: {
  config: $BfspProjectConfig;
  viteConfigBuildOptions: BFChainUtil.FirstArgument<typeof ViteConfigFactory>;
}) => {
  const { config, viteConfigBuildOptions } = options;

  const tscLogger = createTscLogger();
  log("running bfsp build!");

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const tsconfigPath = path.join(config.projectDirpath, "tsconfig.json");

  const compilation = new Promise<boolean>((resolveCompilation) => {
    const tscWorker = new Worker(path.join(__dirname, "./tsc_worker.mjs"), {
      argv: ["--build", tsconfigPath],
      stdin: false,
      stdout: false,
      stderr: false,
    });
    tscWorker.on("message", (data) => {
      const cmd = data[0];
      if (cmd === "clearScreen") {
        tscLogger.clear();
      } else if (cmd === "write") {
        const s = data[1];
        const foundErrors = s.match(/Found (\d+) error/);
        if (foundErrors !== null) {
          // no need for error count check. ts won't report 'found 0 error' when not in watch mode
          tscWorker.terminate();
          resolveCompilation(false);
        }
        tscLogger.write(s);
      } else if (cmd === "exit") {
        tscWorker.terminate();
        resolveCompilation(data[1] === 0); // exitCode===0 for success
      }
    });
  });
  const success = await compilation;
  if (!success) {
    return;
  }

  const viteBuildConfig = ViteConfigFactory(viteConfigBuildOptions);

  try {
    await buildBfsp({
      ...viteBuildConfig,
      build: {
        ...viteBuildConfig.build,
        minify: true,
        watch: null,
        sourcemap: true,
        rollupOptions: {
          ...viteBuildConfig.build?.rollupOptions,
          watch: false,
          onwarn: (err) => viteLogger.warn(chalk.yellow(String(err))),
        },
      },
      mode: "production",
      customLogger: viteLogger,
    });

    tscLogger.clear();
    tscLogger.write("build complete");
    tscLogger.stop();
  } catch (e) {
    // viteLogger will log exception message , so e is unused here
    viteLogger.error("bundle error");
  }
};
