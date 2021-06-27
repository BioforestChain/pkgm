declare namespace PKGM {
  namespace Config {
    interface ENVS {
      [key: string]: string | undefined;
    }
    interface DEPS {
      [key: string]: string | undefined;
    }
    interface Learn {
      packages: string[];
      version: string;
    }

    interface Package {
      name: string;
      version: string;
      private: boolean;
      workspaces: string[];
      scripts: { [key: string]: string };
      main: string;
      type?: string;
      files?: string[];
      module?: string;
      dependencies?: DEPS;
      devDependencies?: DEPS;
    }
    interface TsConfig {
      files?: string[];
      include?: string[];
      references?: { path: string }[];

      extends?: string;
      mixin?: string[];
      compilerOptions?: {
        composite?: boolean;
        outDir?: string;
        rootDir?: string;
        types?: string[];
        lib?: string[];
      };
    }

    interface BfsProject {
      name: string;
      shortName?: string;
      version: string;
      vars: ENVS;
      source?: BfsProject.Source;
      projects: _BfsTypedProjectBase['projects'];
      dependencies: _BfsTypedProjectBase['dependencies'];
      plugins?: Partial<BfsProject.Plugins>;
      profiles: BfsProject.Profiles;
      pm: { name: string; version: string };
    }

    /**基础配置信息，用于构建基础的依赖关系 */
    interface _BfsTypedProjectBase {
      type: string;
      name: string;
      projectDirpath: string;
      packageDirpath: string;
      version: string;
      projects: Array<string | [name: string, scope?: string] | { name: string; scope?: string }>;
      dependencies: Array<
        | string
        | [name: string, version?: string, scope?: string]
        | { name: string; version?: string; scope?: string }
      >;
    }
    interface BfsMultiProject extends _BfsTypedProjectBase {
      type: 'multi';
    }
    interface BfsSourceProject extends _BfsTypedProjectBase {
      type: 'source';
      source: BfsProject.Source;
    }
    type BfsTypedProject = BfsSourceProject | BfsMultiProject;
    type TypedProjectMap = Map<string, BfsTypedProject>;

    /**项目聚合体 */
    type BfsMixProjectInfo = {
      packageDir: string;
      packageSrcDir: string;
      bfs: PKGM.Config.BfsProject;
      typed: PKGM.Config.BfsTypedProject;
      refs: Set<BfsMixProjectInfo>;
      writeBfsProject: () => void;
    };
    namespace BfsProject {
      type Source = {
        dirName: string;
        mainFilename: string;
      };

      interface Plugins {
        bdkTsc: Plugins.BdkTsc;
        rollup: Plugins.Rollup | Plugins.Rollup[];
        npmPackage: Package;
        assets: (string | Plugins.Asset)[];
        scripts: Plugins.Script[];
        bundle: Plugins.Bundle | Plugins.Bundle[];
      }
      namespace Plugins {
        type BdkTsc = {
          target: BdkTsc.Target[];
          tsRuntime?: Profile.JsRuntime[];
        };
        namespace BdkTsc {
          type Target = 'cjs' | 'cjs-es5' | 'esm' | 'esm-es6' | 'esm-es5';
        }
        type Asset = {
          copy: boolean;
          from: string;
          to: string;
          fullFrom?: string;
          fullTo?: string;
        };
        type FullAsset = Required<Asset>;
        type Script = {
          name: string;
          command: string;
          description?: string;
          env?: ENVS;
        };
        interface Rollup {
          sourceInputFile: string;
          outputs: import('rollup').OutputOptions[] | import('rollup').OutputOptions;
        }

        type Bundle = (LibBundle | ExecuteBundle) & {
          name: string;
          profile: string[];
        };
        interface LibBundle {
          mode: 'lib';
          /**lib模式，属于最通用的模式，与通常的npm包是一样的，这里提供一些基本的编译选项 */
          libOptions: {
            minify: boolean;
          };
        }
        interface ExecuteBundle {
          mode: 'execute';
          /**execute模式，可执行程序模式，可以理解为是iife打包。单文件包含一切依赖，除非主动声明排除。 */
          programOptions: {
            excludes: string[];
          };
        }
      }

      type Profiles = {
        [type: string]: {
          scopes: string[];
        };
      };
    }
  }

  namespace FS {
    type Stats = import('fs').Stats;
    type BufferEncoding =
      | 'ascii'
      | 'utf8'
      | 'utf-8'
      | 'utf16le'
      | 'ucs2'
      | 'ucs-2'
      | 'base64'
      | 'latin1'
      | 'binary'
      | 'hex';
    type WatchOptions = {
      persistent?: boolean;
      recursive?: boolean;
      ignored?: string[];
    };
    type WatchListener = (event: string, filename: string) => void;
    type WatchFileListener = (curr: PKGM.FS.Stats, prev: PKGM.FS.Stats) => void;
    type Watcher = import('fs').FSWatcher;
    type Dirent = import('fs').Dirent;
  }
  namespace ProjectFS {
    type ProjectSearchConfig = {
      projectConfigFilename?: string;
      projectDirpath?: string;
      inMaskPathResolver?: (filepath: string) => string;
      maskDirname?: string;
    };
  }
}
