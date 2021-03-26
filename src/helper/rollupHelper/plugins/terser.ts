import { Inject, Injectable } from '@bfchain/util-dep-inject';
import { terser, Options } from 'rollup-plugin-terser';
import { Config } from '../../config';
import type { Plugin } from 'rollup';
@Injectable()
export class RollupTerser implements PKGM.RollupPlugin {
  static ARGS = {
    OPTIONS: Symbol('rollup-terser-options'),
  };
  @Inject(RollupTerser.ARGS.OPTIONS, { optional: true })
  options: Options | undefined;

  constructor() {}
  toPlugin(): Plugin {
    return terser();
  }
}
