import { Inject, Injectable, ModuleStroge, Resolve } from '@bfchain/util-dep-inject';
import * as rollup from 'rollup';
import { Config } from '../config';
import { BFS_PROJECT_ARG, PROFILE_LIST, PROFILE_SET } from '../const';
import { EnvHelper } from '../envHelper';
import { Logger } from '../logger';
import { PathHelper } from '../pathHelper';
import { BFSProject } from '../project';
import { ROLLUP_PRIFILE_ARGS } from './const';
import { RollupCjsToEsm } from './plugins/cjsToEsm';
import { RollupCommonJs } from './plugins/commonJs';
import { RollupNodeResolve } from './plugins/nodeResolve';
import { RollupProfileSwitch } from './plugins/profileSwitch';
import { RollupVirtual } from './plugins/Virtual';
import { RollupTscShimCleaner } from './plugins/tscShimCleaner';
import { RollupNodePolyfills } from './plugins/nodePolyfills';
import { RollupAutoPolyfills } from './plugins/autoPolyfill';
import './@types';
import { RollupTerser } from './plugins/terser';

@Injectable()
export class RollupHelper {
  static ARGS = {
    BFS_PROJECT: BFS_PROJECT_ARG,
    SHADOW_DIRNAME: Symbol('shadowDirname'),
    BFS_MIX_PROJECT_INFO_LIST: Symbol('bfsMixProjectInfoList'),
  };
  static from(
    args: {
      bfsProject: RollupHelper['bfsProject'];
      shadowDirname: RollupHelper['shadowDirname'];
      bfsMixProjectInfoList: RollupHelper['bfsMixProjectInfoList'];
    },
    moduleMap = new ModuleStroge()
  ) {
    const ARGS = RollupHelper.ARGS;
    moduleMap.set(ARGS.BFS_PROJECT, args.bfsProject);
    moduleMap.set(ARGS.SHADOW_DIRNAME, args.shadowDirname);
    moduleMap.set(ARGS.BFS_MIX_PROJECT_INFO_LIST, args.bfsMixProjectInfoList);
    return Resolve(RollupHelper, moduleMap);
  }
  constructor(
    @Inject(RollupHelper.ARGS.BFS_PROJECT)
    private bfsProject: BFSProject,
    @Inject(RollupHelper.ARGS.SHADOW_DIRNAME)
    private shadowDirname: string,
    @Inject(RollupHelper.ARGS.BFS_MIX_PROJECT_INFO_LIST)
    private bfsMixProjectInfoList: PKGM.Config.BfsMixProjectInfo[],
    private path: PathHelper,
    private env: EnvHelper,
    private config: Config,
    private logger: Logger,
    private moduleMap: ModuleStroge
  ) {}
  private getAllRollupProjectList() {
    const rollupProjectList: {
      projectConfig: PKGM.Config.BfsProject;
      rollupOptions: rollup.RollupOptions;
      rollupOutputs: rollup.OutputOptions[];
    }[] = [];
    for (const { packageDir, bfs: projectConfig } of this.bfsMixProjectInfoList) {
      const moduleMap = new ModuleStroge([], this.moduleMap);
      const rollupConfig = projectConfig.plugins?.rollup;
      const rollupConfigList = rollupConfig
        ? rollupConfig instanceof Array
          ? rollupConfig
          : [rollupConfig]
        : [];
      for (const rollupConfig of rollupConfigList) {
        /// 将配置与环境变量进行解析合并
        const env = this.env.getInnerEnv(projectConfig, {
          ROLLUP_BUILD_DIR: this.path.join(
            this.bfsProject.projectDirname,
            this.config.rollupOutputDirname
          ),
        });
        this.env.resolveWithEnv(rollupConfig, env);

        /// 将ts文件解析成js文件入口
        const { sourceInputFile } = rollupConfig;
        const sourceInputFileInfo = this.path.parse(sourceInputFile);
        sourceInputFileInfo.ext = '.js';
        sourceInputFileInfo.base = sourceInputFileInfo.name + sourceInputFileInfo.ext;
        const rollupInputFile = this.path.format(sourceInputFileInfo);
        const inputFile = this.path.join(packageDir, 'esm', rollupInputFile);
        const outputName = projectConfig.name.startsWith('@')
          ? projectConfig.name.slice(1).replace('/', '__').replace(/-/g, '_')
          : projectConfig.name;

        const rollupOutputs: rollup.OutputOptions[] = [];
        if (rollupConfig.outputs) {
          if (rollupConfig.outputs instanceof Array) {
            rollupOutputs.push(...rollupConfig.outputs);
          } else {
            rollupOutputs.push(rollupConfig.outputs);
          }
        }
        /// 配置默认导出
        if (rollupOutputs.length === 0) {
          rollupOutputs.push({
            file: this.path.join(env.ROLLUP_BUILD_DIR, `${outputName}.js`),
            name: outputName,
            format: 'iife',
          });
        }
        /// 写入插件配置
        if (rollupConfig.rollupCommonJSOptions) {
          moduleMap.set(RollupCommonJs.ARGS.OPTIONS, rollupConfig.rollupCommonJSOptions);
        }
        if (rollupConfig.rollupNodeResolveOptions) {
          moduleMap.set(RollupNodeResolve.ARGS.OPTIONS, rollupConfig.rollupNodeResolveOptions);
        }
        if (rollupConfig.rollupTerserOptions) {
          moduleMap.set(RollupTerser.ARGS.OPTIONS, rollupConfig.rollupTerserOptions);
        }
        if (rollupConfig.rollupProfileOptions) {
          const { platform, jsRuntime, runtimeMode, channel } = rollupConfig.rollupProfileOptions;
          platform && moduleMap.set(ROLLUP_PRIFILE_ARGS.PLATFORM, platform);
          channel && moduleMap.set(ROLLUP_PRIFILE_ARGS.CHANNEL, channel);
          jsRuntime && moduleMap.set(ROLLUP_PRIFILE_ARGS.JS_RUNTIME, jsRuntime);
          runtimeMode && moduleMap.set(ROLLUP_PRIFILE_ARGS.RUNTIME_MODE, runtimeMode);
        }

        /// 配置rollup编译与插件
        const tscShimCleaner = this.getTscShimCleaner(moduleMap);
        const virtualPlugin = this.getVirtualPlugin(moduleMap);
        const cjsToEsmPlugin = this.getCjsToEsmPlugin(moduleMap);
        const profileSwitchPlugin = this.getProfileSwitchPlugin(moduleMap);
        const nodePolyfillsPlugin = this.getNodePolyfillsPlugin(moduleMap);
        const autoPolyfillsPlugin = this.getRollupAutoPolyfills(moduleMap);
        const terserPlugin = this.getTerserPlugin(moduleMap)

        /// 这两个垫底，最好不要改动
        const nodeResolvePlugin = this.getNodeResolvePlugin(moduleMap);
        const commonJsPlugin = this.getCommonJsPlugin(moduleMap);

        const rollupOptions: rollup.RollupOptions = {
          plugins: [
            tscShimCleaner.toPlugin(),
            virtualPlugin.toPlugin(),
            cjsToEsmPlugin.toPlugin(),
            profileSwitchPlugin.toPlugin(),
            nodeResolvePlugin.options.preferBuiltins && nodePolyfillsPlugin.toPlugin(),
            terserPlugin.options && terserPlugin.toPlugin(),

            /// 这两个垫底，最好不要改动
            nodeResolvePlugin.toPlugin(),
            commonJsPlugin.toPlugin(),
            /// 对所有代码进行垫片
            autoPolyfillsPlugin.toPlugin(),
          ].filter(Boolean) as Plugin[],
          preserveModules: rollupConfig.preserveModules,
          input: inputFile,
          onwarn(warning, warn) {
            if (warning.code === 'THIS_IS_UNDEFINED') {
              return;
            }
            warn(warning);
          },
        };

        rollupProjectList.push({ projectConfig, rollupOptions, rollupOutputs });
      }
    }
    return rollupProjectList;
  }
  // @cacheGetter
  private getCjsToEsmPlugin(moduleMap: ModuleStroge) {
    return Resolve(RollupCjsToEsm, moduleMap);
  }
  // @cacheGetter
  private getProfileSwitchPlugin(moduleMap: ModuleStroge) {
    return Resolve(RollupProfileSwitch, moduleMap);
  }
  // @cacheGetter
  private getCommonJsPlugin(moduleMap: ModuleStroge) {
    return Resolve(RollupCommonJs, moduleMap);
  }
  // @cacheGetter
  private getNodePolyfillsPlugin(moduleMap: ModuleStroge) {
    return Resolve(RollupNodePolyfills, moduleMap);
  }
  private getRollupAutoPolyfills(moduleMap: ModuleStroge) {
    return Resolve(RollupAutoPolyfills, moduleMap);
  }
  // @cacheGetter
  private getNodeResolvePlugin(moduleMap: ModuleStroge) {
    return Resolve(RollupNodeResolve, moduleMap);
  }
  // @cacheGetter
  private getVirtualPlugin(moduleMap: ModuleStroge) {
    return Resolve(RollupVirtual, moduleMap);
  }
  private getTscShimCleaner(moduleMap: ModuleStroge) {
    return Resolve(RollupTscShimCleaner, moduleMap);
  }
  private getTerserPlugin(moduleMap: ModuleStroge) {
    return Resolve(RollupTerser, moduleMap);
  }
  doCompile(args: {
    watch?: boolean;
    jsRuntime?: PKGM.Profile.JsRuntime;
    runtimeMode?: PKGM.Profile.RuntimeMode;
    platform?: PKGM.Profile.Platform;
    channel?: PKGM.Profile.Channel;
  }) {
    const profileArgv = new Map<
      string,
      {
        key: typeof ROLLUP_PRIFILE_ARGS[keyof typeof ROLLUP_PRIFILE_ARGS];
        value: string;
      }
    >();
    this.moduleMap.set(ROLLUP_PRIFILE_ARGS.RUNTIME_MODE, args.runtimeMode);
    this.moduleMap.set(ROLLUP_PRIFILE_ARGS.PLATFORM, args.platform);
    this.moduleMap.set(ROLLUP_PRIFILE_ARGS.CHANNEL, args.channel);
    this.moduleMap.set(ROLLUP_PRIFILE_ARGS.JS_RUNTIME, args.jsRuntime);
    for (const runtimeMode of PROFILE_LIST.RUNTIME_MODE) {
      const item = { key: ROLLUP_PRIFILE_ARGS.RUNTIME_MODE, value: runtimeMode };
      profileArgv.set(`--${runtimeMode}`, item);
      profileArgv.set(`--runtime-mode=${runtimeMode}`, item);
      profileArgv.set(`--runtimeMode=${runtimeMode}`, item);
    }
    for (const jsRuntime of PROFILE_LIST.JS_RUNTIME) {
      const item = { key: ROLLUP_PRIFILE_ARGS.JS_RUNTIME, value: jsRuntime };
      profileArgv.set(`--${jsRuntime}`, item);
      profileArgv.set(`--js-runtime=${jsRuntime}`, item);
      profileArgv.set(`--jsRuntime=${jsRuntime}`, item);
    }
    for (const platform of PROFILE_LIST.PLATFORM) {
      const item = { key: ROLLUP_PRIFILE_ARGS.PLATFORM, value: platform };
      profileArgv.set(`--${platform}`, item);
      profileArgv.set(`--platform=${platform}`, item);
    }
    for (const channel of PROFILE_LIST.CHANNEL) {
      const item = { key: ROLLUP_PRIFILE_ARGS.CHANNEL, value: channel };
      profileArgv.set(`--${channel}`, item);
      profileArgv.set(`--channel=${channel}`, item);
    }
    // this.logger.debug()
    /// 编译命令行参数来导入到配置中
    for (const argv of process.argv.slice(2)) {
      const item = profileArgv.get(argv);
      if (item) {
        this.moduleMap.set(item.key, item.value);
      }
    }

    this.logger.info('rollup plugin start:', {
      watch: !!args.watch,
      runtimeMode: this.moduleMap.get(ROLLUP_PRIFILE_ARGS.RUNTIME_MODE),
      jsRuntime: this.moduleMap.get(ROLLUP_PRIFILE_ARGS.JS_RUNTIME),
      platform: this.moduleMap.get(ROLLUP_PRIFILE_ARGS.PLATFORM),
      channel: this.moduleMap.get(ROLLUP_PRIFILE_ARGS.CHANNEL),
    });

    const rollupProjectList = this.getAllRollupProjectList();
    if (args.watch) {
      const rollupWatcher = rollup.watch(
        rollupProjectList.map((rp) => {
          return {
            ...rp.rollupOptions,
            output: rp.rollupOutputs,
          };
        })
      );
      this.logger.info('rollup plugin start watching.');
      rollupWatcher.on('event', (event) => {
        switch (event.code) {
          case 'START':
            this.logger.info('rollup plugin building.');
            break;
          case 'BUNDLE_START':
            let input = event.input;
            if (typeof input === 'string') {
              input = this.logger.$.path(input);
            } else if (input instanceof Array) {
              input = input.map((i) => this.logger.$.path(i)).join(', ');
            } else if (input) {
              const newInput: typeof input = {};
              for (const ea in input) {
                newInput[ea as keyof typeof input] = this.logger.$.path(input[ea]);
              }
              input = newInput;
            }
            this.logger.debug('rollup plugin bundle start:', input);
            break;
          case 'BUNDLE_END':
            this.logger.success(
              'rollup plugin bundle success:',
              event.output.map((o) => this.logger.$.path(o)).join(', ')
            );
            break;
          case 'ERROR':
            this.logger.error('rollup plugin error:', event.error);
            break;
        }
      });
      return rollupWatcher;
    } else {
      return rollupProjectList.map(async (rp) => {
        const bundle = await rollup.rollup(rp.rollupOptions);
        // bundle.generate(rp.rollupOutput)
        for (const oo of rp.rollupOutputs) {
          await bundle.write(oo);
        }
        this.logger.success('rollup plugin done');
      });
    }
  }
}
