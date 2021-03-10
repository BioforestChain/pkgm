import { cacheGetter } from '@bfchain/util-decorator';
import { Inject, Injectable } from '@bfchain/util-dep-inject';
import { Plugin } from 'rollup';
import { Reader } from '../../reader';

@Injectable()
export class RollupVirtual implements PKGM.RollupPlugin {
  static ARGS = {
    OPTIONS: Symbol('rollup-virtual'),
  };
  constructor(
    @Inject(RollupVirtual.ARGS.OPTIONS, { optional: true })
    private options: PKGM.RollupPlugin.VirtualOptions = {},
    private reader: Reader
  ) {
    Object.defineProperty(options, '@bfchain/jsbi', {
      get: () => {
        const value = this._bfchainJsbi;
        Object.defineProperty(options, '@bfchain/jsbi', { value });
        return value;
      },
      configurable: true,
    });
  }
  @cacheGetter
  private get _bfchainJsbi() {
    return this.reader.readFile(__dirname + '/../../../../assets/jsbi.js', 'utf-8');
  }

  toPlugin(): Plugin {
    const PREFIX = `\0virtual:`;
    return {
      name: 'virtual',
      resolveId: (id, _importer) => {
        if (this.options.hasOwnProperty(id)) {
          return PREFIX + id;
        }
        return null;
      },
      load: (id) => {
        if (id.startsWith(PREFIX)) {
          const z = id.slice(PREFIX.length);
          return this.options[id.slice(PREFIX.length)];
        }
        return null;
      },
    };
  }
}
