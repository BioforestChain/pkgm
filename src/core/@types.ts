declare namespace PKGM {
  namespace Config {
    type ENVS = { [key: string]: string };
    type DEPS = { [key: string]: string };
    type Learn = {
      packages: string[];
      version: string;
    };

    type Package = {
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
    };
    type TsConfig = {
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
    };

    type BfsProject = {
      name: string;
      shortName?: string;
      version: string;
      vars: ENVS;
      source?: BfsProject.Source;
      projects: string[];
      dependencies: _BfsTypedProjectBase['dependencies'];
      plugins?: Partial<BfsProject.Plugins>;
    };

    interface _BfsTypedProjectBase {
      type: string;
      name: string;
      projectDirpath: string;
      packageDirpath: string;
      version: string;
      projects: string[];
      dependencies: Array<
        string | [name: string, version?: string] | { name: string; version?: string }
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
      type Source = { dirName: string; mainFilename: string };

      interface Plugins {
        bdkTsc: Plugins.BdkTsc;
        rollup: Plugins.Rollup | Plugins.Rollup[];
        npmPackage: Package;
        assets: (string | Plugins.Asset)[];
        scripts: Plugins.Script[];
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
          env?: ENVS;
        };
        interface Rollup {
          sourceInputFile: string;
          outputs: import('rollup').OutputOptions[] | import('rollup').OutputOptions;
        }
      }
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
