import { EasyMap } from "@bfchain/pkgm-base/util/extends_map";
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
  SharedAsyncIterable,
  SharedFollower,
} from "@bfchain/pkgm-bfsp/sdk";
import EventEmitter from "node:events";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { States } from "./states";
import { WorkspacePackageJson } from "./workspacePackageJson";
import { WorkspaceTsConfig } from "./workspaceTsConfig";

export type $ProjectConfigStreams = ReturnType<WorkspaceConfigBase["_createProjectConfigStreams"]>;
export type $ProjectConfigStreamsMap = Map<string, $ProjectConfigStreams>;

export class WorkspaceConfigBase {
  constructor(readonly root: string, protected _config: Bfsw.Workspace, protected _logger: PKGM.TuiLogger) {
    // buildService.watcher.watchWorkspace(() => this._reload());
    this._refreshProjectConfigStreamsMap(_config);
  }

  readonly states = new States(this);
  readonly tsConfig = new WorkspaceTsConfig(this);
  readonly packageJson = new WorkspacePackageJson(this);

  get projects() {
    return this._config.projects;
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
      this.states.add(projectRoot, { userConfig: proj, projectRoot: projectRoot });
      projectConfigMap.set(projectRoot, proj);
    }

    /// 更新配置
    for (const [projectRoot, proj] of projectConfigMap) {
      if (this._projectConfigStreamsMap.has(projectRoot) === false) {
        newProjectRoots.add(projectRoot);
      }

      /// 生成流，更新流数据
      const projectConfigStreams = this._projectConfigStreamsMap.forceGet(projectRoot);
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
    creater: (projectRoot: string) => this._createProjectConfigStreams(projectRoot),
  });
  /**
   * 为单个bfsp项目生成配置流
   */
  protected _createProjectConfigStreams(projectRoot: string) {
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

    let _watchDeps: ReturnType<WorkspaceConfigBase["_doWatchDeps"]> | undefined;

    return {
      projectRoot,
      userConfigFollower,
      userConfigStream,
      viteConfigStream,
      tsConfigStream,
      packageJsonStream,
      gitIgnoreStream,
      npmIgnoreStream,
      getDepsInstallStream: () => {
        return (_watchDeps ??= this._doWatchDeps(projectRoot, packageJsonStream)).stream;
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
  protected _unitunifyPackageJson = {
    dependencies: {},
    devDependencies: {},
    peerDependencies: {},
    optionalDependencies: {},
  } as unknown as $PackageJson;

  private __watchDepsFollower?: SharedFollower<$PackageJson>;
  protected get _watchDepsFollower() {
    return (this.__watchDepsFollower ??= new SharedFollower<$PackageJson>());
  }
  private __watchDepsStream?: ReturnType<typeof doWatchDeps>;
  protected get _watchDepsStream() {
    return (this.__watchDepsStream ??= doWatchDeps(
      this.root,
      new SharedAsyncIterable<$PackageJson>(this._watchDepsFollower),
      {
        runInstall: true,
        runListGetter: () => {
          return this.projects.map((p) => p.packageJson?.name ?? p.name);
        },
      }
    ));
  }

  private _doWatchDeps(projectRoot: string, packageJsonStream: SharedAsyncIterable<$PackageJson>) {
    const { _unitunifyPackageJson } = this;

    const prefix = projectRoot + ":";
    const joinPackageJson = (packageJson: $PackageJson) => {
      _joinPrefix(prefix, packageJson.dependencies, _unitunifyPackageJson.dependencies);
      _joinPrefix(prefix, packageJson.devDependencies, _unitunifyPackageJson.devDependencies);
      _joinPrefix(prefix, packageJson.peerDependencies, _unitunifyPackageJson.peerDependencies);
      _joinPrefix(prefix, packageJson.optionalDependencies, _unitunifyPackageJson.optionalDependencies);
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
const _joinPrefix = (prefix: string, fromDeps: Bfsp.Dependencies, toDeps: Bfsp.Dependencies) => {
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
