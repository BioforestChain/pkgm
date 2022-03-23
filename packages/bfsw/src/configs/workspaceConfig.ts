import { build, Loader, Plugin } from "@bfchain/pkgm-base/lib/esbuild";
import { EasyMap } from "@bfchain/pkgm-base/util/extends_map";
import {
  $BfspUserConfig,
  $getBfspUserConfig,
  $PackageJson,
  $readFromMjs,
  createTsconfigForEsbuild,
  DevLogger,
  doWatchDeps,
  fileIO,
  folderIO,
  getWatcher,
  SharedAsyncIterable,
  SharedFollower,
  toPosixPath,
  watchPackageJson,
  watchTsConfig,
  watchViteConfig,
  watchGitIgnore,
  watchNpmIgnore,
} from "@bfchain/pkgm-bfsp";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import path, { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
// import bfswTsconfigContent from "../../assets/tsconfig.bfsw.json?raw";
const bfswTsconfigContent = '{}'
import { consts } from "../consts";
import { States } from "./states";
import { WorkspacePackageJson } from "./workspacePackageJson";
import { WorkspaceTsConfig } from "./workspaceTsConfig";

export const defineWorkspace = (cb: () => Bfsw.Workspace) => {
  return cb();
};

const bfswTsconfigFilepath = createTsconfigForEsbuild(bfswTsconfigContent);

export type $ProjectConfigStreams = ReturnType<WorkspaceConfig["_createProjectConfigStreams"]>;
export type $ProjectConfigStreamsMap = Map<string, $ProjectConfigStreams>;
export type $WorkspaceWatcher = BFChainUtil.PromiseReturnType<typeof WorkspaceConfig["getWatcher"]>;

export class WorkspaceConfig {
  constructor(readonly root: string, private _config: Bfsw.Workspace, private _logger: PKGM.Logger) {
    // buildService.watcher.watchWorkspace(() => this._reload());
    this._refreshProjectConfigStreamsMap(_config);
  }

  readonly states = new States(this);
  readonly tsConfig = new WorkspaceTsConfig(this);
  readonly packageJson = new WorkspacePackageJson(this);

  get projects() {
    return this._config.projects;
  }
  static async loadConfig(workspaceRoot: string) {
    const debug = DevLogger("bfsw:config/load");

    const externalMarker: Plugin = {
      name: "#bfsw resolver",
      setup(build) {
        // #bfsp和#bfsw bundle起来读取
        build.onResolve({ filter: /^[^.]/ }, (args) => {
          return {
            external: true,
          };
        });
      },
    };
    const suffixAndLoaderList: {
      suffix: string;
      loader: Loader;
    }[] = [
      { suffix: ".ts", loader: "ts" },
      { suffix: ".tsx", loader: "ts" },
      { suffix: ".js", loader: "js" },
      { suffix: ".mjs", loader: "js" },
      { suffix: ".json", loader: "json" },
      { suffix: ".cjs", loader: "js" },
      { suffix: ".jsx", loader: "js" },
    ];
    // 用来注入路径信息
    const bfspWrapper: Plugin = {
      name: "#bfsp-wrapper",
      setup(build) {
        build.onResolve(
          {
            filter: /^[.]|#$/,
          },
          (args) => {
            if (/#$/.test(args.path)) {
              return { path: args.path, namespace: "bfsp-wrapper" };
            } else {
              return {
                path: path.join(path.dirname(args.importer), args.path),
                namespace: "bfsp-wrapper",
              };
            }
          }
        );
        build.onLoad(
          {
            filter: /.*/,
            namespace: "bfsp-wrapper",
          },
          async (args) => {
            if (path.basename(args.path) === "#bfsp#") {
              return {
                contents: await fileIO.get(path.join(path.dirname(args.path), "#bfsp.ts")),
                loader: "ts",
              };
            }

            if (path.basename(args.path) === "#bfsp") {
              const bfsp_ = JSON.stringify(toPosixPath(path.join(path.dirname(args.path), "#bfsp#")));
              const dirname = toPosixPath(path.dirname(args.path));
              return {
                contents: `
                                import defaultValue from ${bfsp_};
                                export * from ${bfsp_};
                                const newDefault = {...defaultValue,path:"${dirname}"};
                                export default newDefault;
                                `,
                loader: "ts",
              };
            }

            let filepath = args.path;
            let loader: Loader = "ts";

            if ((await fileIO.has(filepath)) === false) {
              for (const sl of suffixAndLoaderList) {
                const maybeFilepath = filepath + sl.suffix;
                if (await fileIO.has(maybeFilepath)) {
                  filepath = maybeFilepath;
                  loader = sl.loader;
                  break;
                }
              }
              return {
                contents: await fileIO.get(`${args.path}.ts`),
                loader: "ts",
              };
            }
            return { contents: await fileIO.get(filepath), loader };
          }
        );
      },
    };
    for (const filename of await folderIO.get(workspaceRoot)) {
      if (filename === "#bfsw.ts" || filename === "#bfsw.mts" || filename === "#bfsw.mtsx") {
        const cache_filename = `#bfsw-${createHash("md5").update(`${Date.now()}`).digest("hex")}.mjs`;
        const bfswDir = resolve(workspaceRoot, consts.ShadowRootPath);
        if (!existsSync(bfswDir)) {
          mkdirSync(bfswDir);
        }
        const cache_filepath = resolve(bfswDir, cache_filename);
        try {
          debug("complie #bfsw");
          await build({
            entryPoints: [filename],
            absWorkingDir: workspaceRoot,
            bundle: true,
            platform: "node",
            format: "esm",
            write: true,
            outfile: cache_filepath,
            tsconfig: bfswTsconfigFilepath,
            plugins: [externalMarker, bfspWrapper],
          });
          return await $readFromMjs<Bfsw.Workspace>(cache_filepath, true);
        } finally {
          existsSync(cache_filepath) && unlinkSync(cache_filepath);
        }
      }
    }
  }
  static async from(workspaceRoot: string, logger: PKGM.Logger) {
    const config = await this.loadConfig(workspaceRoot);
    if (config !== undefined) {
      return new WorkspaceConfig(workspaceRoot, config, logger);
    }
  }

  private async _reload() {
    const config = await WorkspaceConfig.loadConfig(this.root);
    if (config === undefined) {
      return false;
    }

    this.states.clear();
    this._config = config;
    this._refreshProjectConfigStreamsMap(config);

    return true;
  }
  private _refreshProjectConfigStreamsMap(config: Bfsw.Workspace) {
    const projectConfigStreamsMap = new Map<string, $ProjectConfigStreams>();
    const deletedProjectRoots = new Set<string>();
    const newProjectRoots = new Set<string>();
    for (const proj of config.projects) {
      const projectRoot = path.resolve(this.root, proj.path);
      /// 添加索引
      this.states.add(projectRoot, { userConfig: proj, path: projectRoot });

      if (this._projectConfigStreamsMap.has(projectRoot)) {
        newProjectRoots.add(projectRoot);
      }

      /// 生成流，更新流数据
      const projectConfigStreams = this._projectConfigStreamsMap.forceGet(projectRoot);
      projectConfigStreamsMap.set(projectRoot, projectConfigStreams);

      /// 更新配置
      let needPush = true;
      const curUserConfig = projectConfigStreams.userConfigStream.current?.userConfig;
      if (curUserConfig !== undefined) {
        needPush = WorkspaceConfig._UserConfigIsEqual(curUserConfig, proj);
      }
      if (needPush) {
        projectConfigStreams.userConfigFollower.push($getBfspUserConfig(proj));
      }
    }
    /// 把其余的项目都停掉
    for (const [projectRoot, projectConfigStreams] of this._projectConfigStreamsMap) {
      if (projectConfigStreamsMap.has(projectRoot)) {
        continue;
      }
      projectConfigStreams.stopAll();
      deletedProjectRoots.add(projectRoot);
      this._projectConfigStreamsMap.delete(projectRoot);
    }

    /// 推送更新
    this._projectConfigStreamsMapFollower.push(projectConfigStreamsMap);
    this._deletedProjectRootsFollower.push(deletedProjectRoots);
    this._newProjectRootsFollower.push(newProjectRoots);

    return { projectConfigStreamsMap };
  }

  private _projectConfigStreamsMapFollower = new SharedFollower<$ProjectConfigStreamsMap>();
  readonly projectConfigStreamsMapStream = new SharedAsyncIterable(
    this._projectConfigStreamsMapFollower.toAsyncIterator()
  );
  private _deletedProjectRootsFollower = new SharedFollower<Set<string>>();
  readonly deletedProjectRootsStream = new SharedAsyncIterable(this._deletedProjectRootsFollower.toAsyncIterator());
  private _newProjectRootsFollower = new SharedFollower<Set<string>>();
  readonly newProjectRootsStream = new SharedAsyncIterable(this._newProjectRootsFollower.toAsyncIterator());

  /**
   * 判断两个UserConfig是否等价
   * @TODO 跳过一些不必要的字段，比如formats只取第一个值就行
   * @TODO 搬迁到 ProjectConfig 的类中
   */
  private static _UserConfigIsEqual(cfg1: Bfsp.UserConfig, cfg2: Bfsp.UserConfig) {
    return isDeepStrictEqual(cfg1, cfg2);
  }

  private _projectConfigStreamsMap = EasyMap.from({
    creater: (projectRoot: string) => this._createProjectConfigStreams(projectRoot),
  });
  private _createProjectConfigStreams(projectRoot: string) {
    const userConfigFollower = new SharedFollower<$BfspUserConfig>();
    const userConfigStream = new SharedAsyncIterable<$BfspUserConfig>(userConfigFollower);
    const tsConfigStream = watchTsConfig(projectRoot, userConfigStream, {
      write: true,
      logger: this._logger,
    });
    const viteConfigStream = watchViteConfig(projectRoot, userConfigStream, tsConfigStream);

    const packageJsonStream = watchPackageJson(projectRoot, userConfigStream, tsConfigStream, {
      write: true,
    });

    const gitIgnoreStream = watchGitIgnore(projectRoot, userConfigStream, {
      write: true,
    });

    const npmIgnoreStream = watchNpmIgnore(projectRoot, userConfigStream, {
      write: true,
    });

    const watchDeps = this._doWatchDeps(projectRoot, packageJsonStream);

    return {
      projectRoot,
      userConfigFollower,
      userConfigStream,
      viteConfigStream,
      tsConfigStream,
      packageJsonStream,
      gitIgnoreStream,
      npmIgnoreStream,
      depsInstallStream: watchDeps.stream,
      stopAll() {
        userConfigStream.stop();
        viteConfigStream.stop();
        tsConfigStream.stop();
        packageJsonStream.stop();
        gitIgnoreStream.stop();
        npmIgnoreStream.stop();
        watchDeps.stop();
      },
    };
  }

  //#region 统一的依赖监听与安装

  private _watchDepsFollower = new SharedFollower<$PackageJson>();
  private _watchDeps = doWatchDeps(this.root, new SharedAsyncIterable<$PackageJson>(this._watchDepsFollower), {
    runInstall: true,
  });
  private _unitunifyPackageJson = {
    dependencies: {},
    devDependencies: {},
    peerDependencies: {},
    optionalDependencies: {},
  } as unknown as $PackageJson;
  private _doWatchDeps(projectRoot: string, packageJsonStream: SharedAsyncIterable<$PackageJson>) {
    const { _unitunifyPackageJson } = this;

    const prefix = projectRoot + ":";
    const joinPrefix = (fromDeps: Bfsp.Dependencies, toDeps: Bfsp.Dependencies) => {
      /// 先删除原先的依赖
      for (const key in toDeps) {
        if (key.startsWith(prefix)) {
          delete toDeps[key];
        }
      }
      // 再参入现有的依赖项
      for (const key in fromDeps) {
        toDeps[prefix + key] = fromDeps[key];
      }
    };
    const off = packageJsonStream.onNext((packageJson) => {
      joinPrefix(packageJson.dependencies, _unitunifyPackageJson.dependencies);
      joinPrefix(packageJson.devDependencies, _unitunifyPackageJson.devDependencies);
      joinPrefix(packageJson.peerDependencies, _unitunifyPackageJson.peerDependencies);
      joinPrefix(packageJson.optionalDependencies, _unitunifyPackageJson.optionalDependencies);
      this._watchDepsFollower.push(_unitunifyPackageJson);
    });
    return {
      stream: this._watchDeps.stream,
      stop: off,
    };
  }
  //#endregion

  /**写入配置文件到磁盘 */
  async write() {}
  /**监听配置，转成流 */
  async watch() {}
  /**监听配置变动，将新的导出配置写入磁盘 */
  static async getWatcher(workspaceRoot: string) {
    const watcher = await getWatcher(workspaceRoot);

    //#region bfsw+bfsp
    watcher.doWatch(
      {
        expression: [
          "allof",
          [
            "anyof",
            //
            ["name", ["#bfsw.ts", "wholename"]],
            ["name", ["#bfsp.ts", "wholename"]],
          ],
          ["not", ["match", "**/node_modules/**", "wholename"]],
          ["not", ["match", "**/.*/**", "wholename"]],
        ],
        chokidar: [
          ["#bfsw.ts", "#bfsp.ts"].map((x) => `./**/${x}`),
          { cwd: workspaceRoot, ignoreInitial: true, ignored: [/node_modules*/, /\.bfsp*/] },
        ],
      },
      (p, type) => {
        for (const cb of bfswCbs) {
          try {
            cb(p, type);
          } catch {}
        }
      }
    );
    const bfswCbs = [] as Bfsp.WatcherHanlder[];
    //#endregion

    //#region tsfiles
    watcher.doWatch(
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
          ["not", ["match", "**/build/**", "wholename"]], // @todo 转到 .bfsp 文件夹下
          ["not", ["match", "**/dist/**", "wholename"]], // @todo 转到 .bfsp 文件夹下
          ["not", ["match", "**/.*/**", "wholename"]],
        ],
        chokidar: [
          ["assets/**/*.json", "**/*.ts", "**/*.tsx", "**/*.cts", "**/*.mts", "**/*.ctsx", "**/*.mtsx"],
          {
            cwd: workspaceRoot,
            ignoreInitial: false,
            followSymlinks: true,
            ignored: [/.*\.d\.ts$/, /\.bfsp*/, /#bfsp\.ts$/, /node_modules*/],
          },
        ],
      },
      (p, type) => {
        const filepath = path.resolve(workspaceRoot, p);
        for (const [projectRoot, cbs] of tsCbMap) {
          if (filepath.startsWith(projectRoot)) {
            for (const cb of cbs) {
              try {
                cb(path.relative(projectRoot, filepath), type);
              } catch {}
            }
          }
        }
      }
    );

    const tsCbMap = EasyMap.from({
      creater: (_projectRoot: string) => {
        return [] as Array<Bfsp.WatcherHanlder>;
      },
    });
    //#endregion

    return Object.assign(
      {
        watchTs: (root: string, cb: Bfsp.WatcherHanlder) => {
          tsCbMap.forceGet(path.resolve(workspaceRoot, root)).push(cb);
        },
        // 不提供bfsp的监听功能，统一由bfsw来管理
        watchUserConfig() {},
      } as Bfsp.AppWatcher,
      {
        watchWorkspace(cb: Bfsp.WatcherHanlder) {
          bfswCbs.push(cb);
        },
      }
    );
  }
}
