import { Injectable } from '@bfchain/util-dep-inject';
import * as prettier from 'prettier';

/**
 * 格式化者
 */
@Injectable()
export class Formater {
  fmtJSON(source: string) {
    return prettier.format(source, { parser: 'json' });
  }
  fmtJSON5(source: string) {
    return prettier.format(source, { parser: 'json5' });
  }
  fmtYAML(source: string) {
    return prettier.format(source, { parser: 'yaml' });
  }
}
