import { sleep } from "@bfchain/util-extends-promise";
import { PromiseOut } from "@bfchain/util-extends-promise-out";
import chalk from "chalk";
import { renameSync } from "node:fs";
import { readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { build as buildBfsp } from "vite";
import { parseExports, parseFormats } from "../src";
import { getBfspProjectConfig, watchBfspProjectConfig, writeBfspProjectConfig } from "../src/bfspConfig";
import { $TsConfig } from "../src/configs/tsConfig";
import { generateViteConfig } from "../src/configs/viteConfig";
import { createDevTui, Debug } from "../src/logger";
import { Closeable, fileIO } from "../src/toolkit";
import { ViteConfigFactory } from "./vite-build-config-factory";

const { createViteLogger, createTscLogger } = createDevTui();

interface RunTscOption {
  tsconfigPath: string;
  onMessage: (s: string) => void;
  onClear: () => void;
  onSuccess?: () => void;
  onExit?: () => void;
  watch?: boolean;
}
const runTsc = (opts: RunTscOption) => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const workerMjsPath = path.join(__dirname, "../tsc_worker.mjs");
  const tscWorker = new Worker(workerMjsPath, {
    argv: ["--build", opts.tsconfigPath, opts.watch ? "-w" : ""],
    stdin: false,
    stdout: false,
    stderr: false,
  });
  const ret = {
    stop() {
      tscWorker.terminate();
    },
  };

  tscWorker.on("message", (data) => {
    const cmd = data[0];
    if (cmd === "clearScreen") {
      opts.onClear();
    } else if (cmd === "write") {
      const foundErrors = data[1].match(/Found (\d+) error/);
      if (foundErrors !== null) {
        const errorCount = parseInt(foundErrors[1]);
        if (errorCount === 0) {
          opts.onSuccess && opts.onSuccess();
        }
      }
      opts.onMessage(data[1]);
    } else if (cmd === "exit") {
      opts.onExit && opts.onExit();
    }
  });
  return ret;
};
export function rearrange<T>(numContainer: number, items: T[], cb: (items: T[]) => void) {
  if (items.length < numContainer) {
    items.forEach((x) => cb([x]));
    return;
  }
  const avg = Math.floor(items.length / numContainer);
  const mod = items.length % numContainer;
  for (let i = 0; i < numContainer; i++) {
    const start = i * avg;
    const slicedItems = items.slice(start, start + avg);
    if (mod > 0 && i < mod) {
      slicedItems.push(items[items.length - mod + i]);
    }
    cb(slicedItems);
  }
}
const runTerser = async (sourceDir: string) => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  const files = [] as string[];
  await recurDo(sourceDir, (p) => {
    if (/\.[mc]?js[x]?$/.test(p)) {
      files.push(p);
    }
  });
  const logger = createTscLogger();
  const workerCount = os.cpus().length - 1;
  const tasks = [] as Promise<{ path: string; success: boolean }[]>[];
  rearrange(workerCount, files, (items) => {
    const task = new Promise<{ path: string; success: boolean }[]>((resolve) => {
      const worker = new Worker(path.join(__dirname, "../terser_worker.mjs"));
      worker.on("message", (v) => {
        if (v.results) {
          worker.terminate();
          resolve(v.results);
        }
      });
      worker.postMessage({ paths: items });
    });
    tasks.push(task);
  });
  const results = (await Promise.all(tasks)).flatMap((v) => v.flatMap((x) => x)).filter((x) => !x.success);
  if (results.length > 0) {
    results.forEach((x) => {
      logger.write(`minify fail: ${x.path}`);
    });
  }
};
const recurDo = async (p: string, cb: (f: string) => void) => {
  if ((await stat(p)).isFile()) {
    cb(p);
  } else {
    const files = await readdir(p);
    for (const f of files) {
      await recurDo(path.join(p, f), cb);
    }
  }
};
const tscOutRoot = `./node_modules/.bfsp/tsc`;
const bundleOutRoot = `./node_modules/.bfsp/build`;
const finalOutRoot = `./build`;

// 任务：生成阶段2的tsconfig
const taskWriteTsConfigStage2 = async (bundlePath: string, outDir: string, tsConfig: $TsConfig, files: string[]) => {
  const tscOutStage2TypingsRoot = path.resolve(outDir, "typings");
  const c = JSON.parse(JSON.stringify(tsConfig)) as typeof tsConfig;
  c.json.compilerOptions.noEmit = false; // true无法生成js文件
  c.json.compilerOptions.target = "es2019";
  c.json.compilerOptions.outDir = outDir;
  c.isolatedJson.compilerOptions.outDir = outDir;
  c.typingsJson.compilerOptions.outDir = tscOutStage2TypingsRoot;
  delete (c.json as any).references;

  c.json.files = files; //Object.keys(userConfig.exportsDetail.formatedExports).map((x) => `${x}.ts`);

  await fileIO.setVal(
    path.resolve(path.join(bundlePath, "tsconfig.json")),
    Buffer.from(JSON.stringify(c.json, null, 2))
  );
  return c;
};

const taskRenameJsToTs = async (rp: string) => {
  const files: string[] = [];
  await recurDo(rp, (p) => {
    if (/\.[mc]?js[x]?$/.test(p)) {
      let newPath = p;
      newPath = newPath.replace(/(.*)\.[mc]?js[x]?$/, "$1.ts");
      renameSync(p, newPath);
      files.push(newPath);
    }
  });
  return files;
};
const taskViteBuild = async (viteBuildConfig: ReturnType<typeof ViteConfigFactory>) => {
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
    customLogger: viteLogger,
  });
};
export const doBuild = async (options: { format?: Bfsp.Format; root?: string; profiles?: string[] }) => {
  const log = Debug("bfsp:bin/build");

  const { root = process.cwd(), format } = options;

  log("root", root);

  const config = await getBfspProjectConfig(root);

  /// 初始化写入配置
  const subConfigs = await writeBfspProjectConfig(config);

  await rm(tscOutRoot, { recursive: true });
  await rm(bundleOutRoot, { recursive: true });

  /// 监听项目变动
  const subStreams = watchBfspProjectConfig(config!, subConfigs);
  const tscLogger = createTscLogger();

  const abortable = Closeable<string, string>("bin:build", async (reasons) => {
    /**防抖，避免不必要的多次调用 */
    const closeSign = new PromiseOut<unknown>();
    (async () => {
      /// debounce
      await sleep(500);
      if (closeSign.is_finished) {
        log("skip vite build by debounce");
        return;
      }

      const userConfig = await subStreams.userConfigStream.getCurrent();
      const tsConfig = await subStreams.tsConfigStream.getCurrent();

      log("running bfsp build!");

      const baseRunTscOpts = {
        onClear: () => tscLogger.clear(),
        onMessage: (s) => tscLogger.write(s),
      } as RunTscOption;

      // watch模式监听ts代码改动
      const tscWatcher = runTsc({
        ...baseRunTscOpts,
        tsconfigPath: path.join(root, "tsconfig.json"),
        onSuccess: async () => {
          // tsc验证没问题，开始执行vite打包
          const buildUserConfigs = userConfig.userConfig.build || [userConfig.userConfig];
          for (const x of buildUserConfigs) {
            const userConfigBuild = Object.assign({}, userConfig.userConfig, x);
            const bundlePath = path.join(bundleOutRoot, userConfigBuild.name);

            const viteConfig1 = await generateViteConfig(
              root,
              {
                userConfig: userConfigBuild,
                exportsDetail: parseExports(userConfigBuild.exports),
                formats: parseFormats(userConfigBuild.formats),
              },
              tsConfig
            );

            const c = ViteConfigFactory({
              projectDirpath: root,
              viteConfig: viteConfig1,
              tsConfig,
              format: format ?? userConfigBuild.formats?.[0],
              outDir: bundlePath,
            });
            await taskViteBuild({ ...c, mode: "development" }); // vite 打包

            const files = await taskRenameJsToTs(path.join(root, bundlePath)); // 改打包出来的文件后缀 js=>ts

            // 在打包出来的目录生成tsconfig，主要是为了es2020->es2019
            const outDir = path.resolve(finalOutRoot, `${userConfigBuild.name}-${options.profiles!.join("-")}`);
            const distDir = path.join(outDir, "dist");
            await taskWriteTsConfigStage2(
              bundlePath,
              distDir,
              tsConfig,
              files.map((x) => path.relative(path.join(root, bundlePath), x))
            );
            const packageJson = {
              name: userConfigBuild.name,
              files: ["dist"],
              ...userConfigBuild.packageJson,
            };

            // 打包目录执行tsc
            const handle = runTsc({
              ...baseRunTscOpts,
              tsconfigPath: path.resolve(path.join(bundlePath, "tsconfig.json")),
              onExit: async () => {
                handle.stop();
                // 写入package.json
                fileIO.setVal(path.join(outDir, "package.json"), Buffer.from(JSON.stringify(packageJson, null, 2)));
                await runTerser(distDir); // 压缩
                tscLogger.write(`built ${chalk.cyan(userConfigBuild.name)} at ${chalk.blue(outDir)}`);
              },
            });
          }
        },

        watch: true,
      });

      closeSign.onSuccess((reason) => {
        log("close bfsp build, reason: ", reason);
        tscWatcher.stop();
      });
    })();

    return (reason: unknown) => {
      closeSign.resolve(reason);
    };
  });

  /// 开始监听并触发编译
  subStreams.userConfigStream.onNext(() => abortable.restart("userConfig changed"));
  subStreams.viteConfigStream.onNext(() => abortable.restart("viteConfig changed"));
  subStreams.tsConfigStream.onNext(() => abortable.restart("tsConfig changed"));
  if (subStreams.viteConfigStream.hasCurrent()) {
    abortable.start();
  }
};
