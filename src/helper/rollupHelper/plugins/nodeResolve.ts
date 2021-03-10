import { Inject, Injectable, ModuleStroge } from '@bfchain/util-dep-inject';
import rollupResolve from '@rollup/plugin-node-resolve';
import type { RollupNodeResolveOptions } from '@rollup/plugin-node-resolve';
import { ROLLUP_PRIFILE_ARGS } from '../const';
import { cacheGetter } from '@bfchain/util-decorator';

@Injectable()
export class RollupNodeResolve implements PKGM.RollupPlugin {
  static ARGS = {
    JS_RUNTIME: ROLLUP_PRIFILE_ARGS.JS_RUNTIME,
    OPTIONS: Symbol('rollup-node_resolve-options'),
  };
  public readonly options: RollupNodeResolveOptions;
  constructor(
    @Inject(RollupNodeResolve.ARGS.JS_RUNTIME, { optional: true })
    public readonly jsRuntime: PKGM.Profile.JsRuntime | undefined,
    @Inject(RollupNodeResolve.ARGS.OPTIONS, { optional: true })
    options: RollupNodeResolveOptions | undefined,
    moduleMap: ModuleStroge
  ) {
    this.options = Object.assign(
      {
        preferBuiltins: true,
        browser: this.isForBrowser,
        customResolveOptions: {
          moduleDirectories: ['node_modules'],
        },
      },
      options
    );
    moduleMap.set(RollupNodeResolve.ARGS.OPTIONS, this.options);
  }
  @cacheGetter
  get isForBrowser() {
    return this.jsRuntime === 'web';
  }
  toPlugin() {
    return rollupResolve(this.options);
  }
}
