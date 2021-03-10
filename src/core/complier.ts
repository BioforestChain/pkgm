import { Inject, Injectable, ModuleStroge, Resolve } from '@bfchain/util-dep-inject';
import { Reader } from '../helper/reader';
import * as execa from 'execa';
import { Config } from '../helper/config';
import { PathHelper } from '../helper/pathHelper';
import { BFSProject } from '../helper/project';
import { Initer } from './initer';
import { RollupHelper } from '../helper/rollupHelper/index';
import { BFS_PROJECT_ARG } from '../helper/const';
import { cacheGetter, quene } from '@bfchain/util-decorator';
import { PromiseOut } from '@bfchain/util-extends-promise-out';
import { AssetsHelper } from '../helper/assetsHelper';
import { Logger } from '../helper/logger';
import { Writer } from '../helper/writer';
import { performance } from 'perf_hooks';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

@Injectable()
export class Complier {
  static ARGS = {
    BFS_PROJECT: BFS_PROJECT_ARG,
  };
  static from(args: { bfsProject: BFSProject }, moduleMap = new ModuleStroge()) {
    moduleMap.set(Complier.ARGS.BFS_PROJECT, args.bfsProject);
    return Resolve(Complier, moduleMap);
  }
  constructor(
    @Inject(Complier.ARGS.BFS_PROJECT)
    private bfsProject: BFSProject,
    private reader: Reader,
    private writer: Writer,
    private config: Config,
    private path: PathHelper,
    private moduleMap: ModuleStroge,
    private asset: AssetsHelper,
    private logger: Logger
  ) {}

  private tscBuildDirs = new Set(['cjs', 'cjs-es5', 'esm', 'esm-es6', 'esm-es5']);
  doClean() {
    const rootPath = this.bfsProject.rootPackageDirpath;
    this.writer.deleteSome(
      rootPath,
      (dirent, info) => {
        if (
          //如果是普通目录，那么不能是@开头的
          (info.deep === 2 && !dirent.name.startsWith('@')) ||
          //如果是@开头的，那必须是3级别目录
          (info.deep > 2 && this.path.relative(rootPath, info.fullpath).startsWith('@'))
        ) {
          if (dirent.isFile()) {
            if (dirent.name.endsWith('.tsbuildinfo')) {
              return true;
            }
          } else {
            // isDirectory
            return this.tscBuildDirs.has(dirent.name);
          }
        }
      },
      /// 只需要遍历到 第三级
      3
    );
  }

  /**
   * 执行编译
   */
  async doComplie(opts: {
    watch?: boolean;
    mode?: 'dev' | 'prod';
    clean?: boolean;
    rollup?: boolean;
    publ?: boolean;
  }) {
    if (opts.clean) {
      this.doClean();
    }

    const SHADOW_DIR = this.bfsProject.rootShadownDirpath;

    const TSC_CMD = this.path.join(SHADOW_DIR, 'node_modules', '.bin', 'bdk-tsc');

    let afterTscBuild = new PromiseOut<boolean>();
    /// typescript 编译
    {
      const tscArgs: string[] = [];
      if (opts.publ) {
        tscArgs.push('--build', this.path.join(SHADOW_DIR, './tsconfig.publ.json'));
      } else {
        if (opts.mode === 'prod') {
          tscArgs.push('--build', this.path.join(SHADOW_DIR, './tsconfig.all.json'));
        } else {
          tscArgs.push('--build', this.path.join(SHADOW_DIR, './tsconfig.json'));
        }
      }

      if (opts.watch) {
        tscArgs.push('-w');
      }
      /// 因为是pipe，所以识别不到tty，这里强行灌入
      if (process.stdout.isTTY) {
        tscArgs.push('--pretty');
      }

      // 显示编译状态....
      const processInterval = setInterval(() => {
        process.stdout.write('.');
      }, 500);
      afterTscBuild.onFinished(() => clearInterval(processInterval));

      /// 执行编译
      const cp = execa.default(TSC_CMD, tscArgs, {
        stdio: ['pipe', 'pipe', 'inherit'],
      });
      /// 对编译输出的数据持续进行“路径”格式化
      (async () => {
        const color_flag_reg = /((\u001b\[\d+m)+)([\s\S]+?)((\u001b\[\d+m)+)/g;
        const pathPrefix = this.config.projectShadowDirname + '/';
        const path_flag_reg = (str: string) => {
          const index1 = str.indexOf(pathPrefix);
          if (index1 !== -1) {
            const index2 = str.slice(index1).search(/\:\d+\:\d+/);
            if (index2 !== -1) {
              return str.slice(index1, index2);
            }
          }
        };
        if (cp.stdout) {
          let isSuccess = true;
          for await (const data of cp.stdout) {
            let dataStr = String(data);
            const noColorDataStr = dataStr.replace(color_flag_reg, '$3');
            for (const line of noColorDataStr.split('\n')) {
              if (line.startsWith(this.config.projectShadowDirname + '/')) {
                const pathname = path_flag_reg(line);
                if (!pathname) {
                  continue;
                }
                const sourcePath = this.path.resolve(pathname);
                const realSourcePath = this.reader.realpath(sourcePath);
                if (realSourcePath !== sourcePath) {
                  dataStr = dataStr.replace(pathname, this.path.relativeCwd(realSourcePath));
                }
              }
            }

            /// 尝试检测初次编译成功
            if (afterTscBuild.is_resolved === false) {
              if (noColorDataStr.includes(' 0 ')) {
                afterTscBuild.resolve((isSuccess = true));
              } else if (noColorDataStr.includes(' error ')) {
                isSuccess = false;
              }
            }
            process.stdout.write('\n');
            process.stdout.write(dataStr);
          }
          /// 如果tsc结束输出了，也意味着编译结束
          afterTscBuild.resolve(isSuccess);
        } else {
          this.logger.error('no .stdout');
        }
      })();
    }
    /// 监听文件变化来自动更新配置文件
    if (opts.watch) {
      const doRelink = new Subject();
      doRelink.pipe(debounceTime(200)).subscribe(async () => {
        try {
          await this._doRelink();
        } catch (err) {
          this.logger.error(`[Relink Fail]`, err.message);
        }
      });

      this.reader.watch(
        this.bfsProject.projectDirname,
        {
          persistent: true,
          recursive: true,
          ignored: ['**/.git', '**/node_modules', '**/' + this.config.projectShadowDirname],
        },
        (event, filename) => {
          // console.log(event, filename);
          // filename = this.path.relative(this.bfsProject.projectDirname, filename);

          /// 如果是文件删除或者新增，都会触发rename事件，确保这个文件不是影子文件夹中的
          if (filename.endsWith('.ts') || filename.endsWith('.tsx')) {
            if (event === 'rename' || event === 'add' || event === 'unlink') {
              // console.log(filename, event);
              doRelink.next();
            }
          } else if (filename.endsWith(this.config.projectConfigFilename)) {
            if (event === 'change') {
              // console.log(filename, event);
              doRelink.next();
            }
          }
        }
      );
    }

    /// 文件拷贝监听
    this.asset.doProjectClone(this.bfsProject.projectDirname, {
      watch: opts.watch,
    });

    /// 执行rollup编译
    if (opts.rollup) {
      afterTscBuild.onSuccess((success) => {
        if (success) {
          this.rollup.doCompile({ watch: opts.watch, runtimeMode: opts.mode });
        }
      });
    }
  }
  @cacheGetter
  private get initer() {
    return Initer.from({ bfsProject: this.bfsProject }, this.moduleMap);
  }
  @cacheGetter
  private get rollup() {
    const shadowDirname = this.initer.getShadowDirname();
    return RollupHelper.from(
      {
        bfsProject: this.bfsProject,
        shadowDirname,
        bfsMixProjectInfoList: this.initer.initShadownProjects(
          this.bfsProject.projectConfig,
          shadowDirname,
          this.bfsProject.readAllTypedProjects()
        ).projectInfoList,
      },
      this.moduleMap
    );
  }

  /**
   * @TODO 支持只relink部分子项目
   */
  private async _doRelink() {
    this.logger.debug('project relinking...');
    const st = performance.now();
    await this.initer.reLink();
    const et = performance.now();
    this.logger.debug(`project reinited [${(et - st).toFixed(4)}ms]`);
  }
}
