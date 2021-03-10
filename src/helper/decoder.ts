import { Injectable } from '@bfchain/util-dep-inject';
import * as json5 from 'json5';
import * as yaml from 'yaml';
import * as path from 'path';
import { Formater } from './formater';

@Injectable()
export class Decoder {
  constructor(private formater: Formater) {}
  getDecoderByFilename(filename: string) {
    const { ext, name } = path.parse(filename);
    switch (ext) {
      case '.json':
        if (name.includes('tsconfig.') || name === 'tsconfig' || name === 'bfsp') {
          // return (obj: unknown) => this.decodeJSON5(obj);
        }
        return (obj: unknown) => this.decodeJSON(obj);
      case '.json5':
        return (obj: unknown) => this.decodeJSON5(obj);
      case '.yaml':
        return (obj: unknown) => this.decodeYAML(obj);
    }
  }
  decodeByFilepath(filename: string, data: unknown) {
    const decoder = this.getDecoderByFilename(filename);
    if (!decoder) {
      throw new SyntaxError(`unknown ext for filename:'${filename}'`);
    }
    return decoder(data);
  }
  decodeJSON(obj: unknown) {
    return this.formater.fmtJSON(JSON.stringify(obj, null, 2));
  }
  decodeJSON5(obj: unknown) {
    return this.formater.fmtJSON5(json5.stringify(obj, null, 2));
  }
  decodeYAML(obj: unknown) {
    return this.formater.fmtYAML(yaml.stringify(obj));
  }
}
