import { Inject, Injectable } from '@bfchain/util-dep-inject';
import rollupNodePolyfills from 'rollup-plugin-node-polyfills';
import { Config } from '../../config';
import type { Plugin } from 'rollup';
@Injectable()
export class RollupNodePolyfills implements PKGM.RollupPlugin {
  constructor(private config: Config) {}
  toPlugin(): Plugin {
    const plugin = rollupNodePolyfills();
    return {
      name: 'nodePolyfills',
      resolveId: (id: string, importer = '') => {
        const resolved = plugin.resolveId(id, importer);
        // if (resolved) {
        //   return resolved.id;
        // }
        return resolved;
      },
    };
  }
}
