import { Inject, Injectable, ModuleStroge } from '@bfchain/util-dep-inject';
import rollupCommonjs, { RollupCommonJSOptions } from '@rollup/plugin-commonjs';
import { Config } from '../../config';
@Injectable()
export class RollupCommonJs implements PKGM.RollupPlugin {
  static ARGS = {
    OPTIONS: Symbol('rollup-commonjs-options'),
  };
  constructor(
    @Inject(RollupCommonJs.ARGS.OPTIONS, { optional: true })
    public readonly options: RollupCommonJSOptions | undefined,
    private config: Config,
    moduleMap: ModuleStroge
  ) {
    this.options = Object.assign(
      {
        include: new RegExp('/' + this.config.projectShadowDirname.replace(/\./g, '\\.') + '/'),
      },
      options
    );
    moduleMap.set(RollupCommonJs.ARGS.OPTIONS, this.options);
  }
  toPlugin() {
    return rollupCommonjs(this.options);
  }
}
