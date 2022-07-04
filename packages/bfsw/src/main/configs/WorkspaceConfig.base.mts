import { SharedAsyncIterable, SharedFollower } from "@bfchain/pkgm-base/toolkit/toolkit.stream.mjs";
import { EasyMap } from "@bfchain/pkgm-base/util/extends_map.mjs";
import {
  $BfspUserConfig,
  $getBfspUserConfig,
  $PackageJson,
  doWatchDeps,
  watchGitIgnore,
  watchNpmIgnore,
  watchPackageJson,
  watchTsConfig,
  watchViteConfig,
  $BfspProjectConfig,
  $BfspEnvConfig,
  BFSP_MODE,
} from "@bfchain/pkgm-bfsp/sdk/index.mjs";
import EventEmitter from "node:events";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { States } from "./states.mjs";
import { WorkspacePackageJson } from "./workspacePackageJson.mjs";
import { WorkspaceTsConfig } from "./workspaceTsConfig.mjs";

export type $ProjectConfigStreams = ReturnType<WorkspaceConfigBase["_createProjectConfigStreams"]>;
export type $ProjectConfigStreamsMap = Map<string, $ProjectConfigStreams>;

export type $WorkspaceEnvConfig = {
  workspaceDirpath: string;
  bfspMode: BFSP_MODE;
};

export class WorkspaceConfigBase {
  constructor(
    readonly envConfig: $WorkspaceEnvConfig,
    protected _config: Bfsw.Workspace,
    protected _logger: PKGM.TuiLogger
  ) {
    // buildService.watcher.watchWorkspace(() => this._reload());
    this._refreshProjectConfigStreamsMap(_config);
  }

  readonly states = new States(this);
  readonly tsConfig = new WorkspaceTsConfig(this);
  readonly packageJson = new WorkspacePackageJson(this);

  get projects() {
    return this._config.projects;
  }
  get root() {
    return this.envConfig.workspaceDirpath;
  }

  /**
   * 基于新的 workspace-config 导入到各个项目中
   * 或者停掉那些被排除掉的项目
   */
  protected _refreshProjectConfigStreamsMap(config: Bfsw.Workspace) {
    const projectConfigStreamsMap = new Map<string, $ProjectConfigStreams>();
    const deletedProjectRoots = new Set<string>();
    const newProjectRoots = new Set<string>();

    const projectConfigMap = new Map<string, Bfsw.WorkspaceUserConfig>();
    /// 添加索引
    for (const proj of config.projects) {
      const projectRoot = path.join(this.root, proj.relativePath);
      if (projectRoot === this.root) {
        /**
         * #bfsp 和 #bfsw 文件目前不该放在同一个目录下，因为它们都要去写 tsconfig.json
         * 目前还不支持将两个模式的文件写在一起
         */
        throw new Error("#bfsp.ts and #bfsw.ts no support in same dir yet.");
      }
      this.states.add(projectRoot, { userConfig: proj, projectRoot: projectRoot });
      projectConfigMap.set(projectRoot, proj);
    }

    /// 更新配置
    for (const [projectRoot, proj] of projectConfigMap) {
      if (this._projectConfigStreamsMap.has(projectRoot) === false) {
        newProjectRoots.add(projectRoot);
      }

      /// 生成流，更新流数据
      const projectConfigStreams = this._projectConfigStreamsMap.forceGet({
        projectDirpath: projectRoot,
        mode: this.envConfig.bfspMode,
      });
      projectConfigStreamsMap.set(projectRoot, projectConfigStreams);

      /// 更新配置
      let needPush = true;
      const curUserConfig = projectConfigStreams.userConfigStream.current?.userConfig;
      if (curUserConfig !== undefined) {
        needPush = WorkspaceConfigBase._UserConfigIsEqual(curUserConfig, proj) === false;
      }
      if (needPush) {
        /// 生成完整项目配置
        const packageConfig = $getBfspUserConfig(proj);
        /// 填写“扩展服务”的数据
        packageConfig.extendsService.tsRefs = this.states.calculateRefsByPath(projectRoot);
        packageConfig.extendsService.dependencies = this.states.calculateDepsByPath(projectRoot);

        projectConfigStreams.userConfigFollower.push(packageConfig);
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
    if (deletedProjectRoots.size > 0) {
      this._deletedProjectRootsFollower.push(deletedProjectRoots);
    }
    if (newProjectRoots.size > 0) {
      this._newProjectRootsFollower.push(newProjectRoots);
    }

    return { projectConfigStreamsMap };
  }

  protected _projectConfigStreamsMapFollower = new SharedFollower<$ProjectConfigStreamsMap>();
  readonly projectConfigStreamsMapStream = new SharedAsyncIterable(this._projectConfigStreamsMapFollower);
  protected _deletedProjectRootsFollower = new SharedFollower<Set<string>>();
  readonly removeProjectRootsStream = new SharedAsyncIterable(this._deletedProjectRootsFollower);
  protected _newProjectRootsFollower = new SharedFollower<Set<string>>();
  readonly addProjectRootsStream = new SharedAsyncIterable(this._newProjectRootsFollower);

  /**
   * 判断两个UserConfig是否等价
   * @TODO 跳过一些不必要的字段，比如formats只取第一个值就行
   * @TODO 搬迁到 ProjectConfig 的类中
   */
  protected static _UserConfigIsEqual(cfg1: Bfsp.UserConfig, cfg2: Bfsp.UserConfig) {
    return isDeepStrictEqual(cfg1, cfg2);
  }

  protected _projectConfigStreamsMap = EasyMap.from({
    transformKey(key) {
      return `${key.mode}+${key.projectDirpath}`;
    },
    creater: (bfspEnvConfig: $BfspEnvConfig) => this._createProjectConfigStreams(bfspEnvConfig),
  });
  /**
   * 为单个bfsp项目生成配置流
   */
  protected _createProjectConfigStreams(bfspEnvConfig: $BfspEnvConfig) {
    const userConfigFollower = new SharedFollower<$BfspUserConfig>();
    const userConfigStream = new SharedAsyncIterable<$BfspUserConfig>(userConfigFollower);
    const tsConfigStream = watchTsConfig(bfspEnvConfig, userConfigStream, {
      write: true,
      logger: this._logger,
    });
    const viteConfigStream = watchViteConfig(bfspEnvConfig, userConfigStream, tsConfigStream);

    const packageJsonStream = watchPackageJson(bfspEnvConfig, userConfigStream, tsConfigStream, {
      write: true,
    });

    const gitIgnoreStream = watchGitIgnore(bfspEnvConfig, userConfigStream, {
      write: true,
    });

    const npmIgnoreStream = watchNpmIgnore(bfspEnvConfig, userConfigStream, {
      write: true,
    });

    let _watchDeps: ReturnType<WorkspaceConfigBase["_doWatchDeps"]> | undefined;

    return {
      bfspEnvConfig,
      userConfigFollower,
      userConfigStream,
      viteConfigStream,
      tsConfigStream,
      packageJsonStream,
      gitIgnoreStream,
      npmIgnoreStream,
      getDepsInstallStream: () => {
        return (_watchDeps ??= this._doWatchDeps(bfspEnvConfig, packageJsonStream)).stream;
      },
      stopAll() {
        userConfigStream.stop();
        viteConfigStream.stop();
        tsConfigStream.stop();
        packageJsonStream.stop();
        gitIgnoreStream.stop();
        npmIgnoreStream.stop();
        _watchDeps?.off();
      },
    };
  }

  /**
   * 销毁 WorkspaceConfig 中构建的流
   */
  destroy() {
    for (const projectConfigStreams of this._projectConfigStreamsMap.values()) {
      projectConfigStreams.stopAll();
    }
    this._projectConfigStreamsMap.clear();
    this.__e?.emit("destroy");
  }
  private __e?: EventEmitter;
  private get _e() {
    return (this.__e ??= new EventEmitter());
  }
  onDestroy(cb: () => void) {
    this._e.on("destroy", cb);
    return () => {
      this._e.off("destroy", cb);
    };
  }

  //#region 统一的“依赖”监听与安装

  /**
   * 这里内存存储的 $PackageJson 是一个假的 package.json
   * 它的主要作用是收集所有子项目的 package.json，将之统筹后，方便 doWatchDeps 用它自己的方式 判定是否触发更改
   */
  protected _unitunifyPackageJson: $UnitunifyPackageJson = {
    dependencies: {},
    devDependencies: {},
    peerDependencies: {},
    optionalDependencies: {},
  };

  private __watchDepsFollower?: SharedFollower<$UnitunifyPackageJson>;
  protected get _watchDepsFollower() {
    return (this.__watchDepsFollower ??= new SharedFollower<$UnitunifyPackageJson>());
  }
  private __watchDepsStream?: ReturnType<typeof doWatchDeps>;
  protected get _watchDepsStream() {
    return (this.__watchDepsStream ??= doWatchDeps(
      this.root,
      new SharedAsyncIterable<$UnitunifyPackageJson>(this._watchDepsFollower),
      {
        runInstall: true,
        rootPackageNameListGetter: () => {
          return this.projects.map((p) => p.packageJson?.name ?? p.name);
        },
      }
    ));
  }

  private _doWatchDeps(bfspEnvConfig: $BfspEnvConfig, packageJsonStream: SharedAsyncIterable<$PackageJson>) {
    const { _unitunifyPackageJson } = this;
    const { projectDirpath } = bfspEnvConfig;

    const prefix = `wmix:${projectDirpath}`;
    const joinPackageJson = (packageJson: $PackageJson) => {
      _unitunifyPackageJson.dependencies[prefix] = packageJson.dependencies;
      _unitunifyPackageJson.devDependencies[prefix] = packageJson.devDependencies;
      _unitunifyPackageJson.peerDependencies[prefix] = packageJson.peerDependencies;
      _unitunifyPackageJson.optionalDependencies[prefix] = packageJson.optionalDependencies;
      this._watchDepsFollower.push(_unitunifyPackageJson);
    };

    const off = packageJsonStream.onNext(joinPackageJson);
    const initPackageJson = packageJsonStream.current;
    if (initPackageJson !== undefined) {
      joinPackageJson(initPackageJson);
    }

    return {
      stream: this._watchDepsStream,
      off,
    };
  }
  //#endregion
}

type $UnitunifyPackageJson = {
  dependencies: $UnitunifyPackageJson.MixDependencies;
  devDependencies: $UnitunifyPackageJson.MixDependencies;
  peerDependencies: $UnitunifyPackageJson.MixDependencies;
  optionalDependencies: $UnitunifyPackageJson.MixDependencies;
};
namespace $UnitunifyPackageJson {
  export type MixDependencies = { [key: string]: Bfsp.Dependencies };
}
