import { Injectable } from '@bfchain/util-dep-inject';
import * as json5 from 'json5';
import * as yaml from 'yaml';
import { Reader } from './reader';
import { PathHelper } from './pathHelper';

@Injectable()
export class Encoder {
  constructor(private reader: Reader, private path: PathHelper) {}
  getEncoderByFilename<T = unknown>(filename: string) {
    const { ext, name } = this.path.parse(filename);
    switch (ext) {
      case '.json':
        if (name.includes('tsconfig.') || name === 'tsconfig' || name === 'bfsp') {
          return (content: string) => this.encodeJSON5<T>(content);
        }
        return (content: string) => this.encodeJSON<T>(content);
      case '.json5':
        return (content: string) => this.encodeJSON5<T>(content);
      case '.yaml':
        return (content: string) => this.encodeYAML<T>(content);
    }
  }
  encodeByFilepath<T = unknown>(filename: string, content?: string) {
    const encoder = this.getEncoderByFilename<T>(filename);
    if (!encoder) {
      throw new SyntaxError(`unknown ext for filename:'${filename}'`);
    }
    try {
      return encoder((content = this.reader.readFile(filename, 'utf-8')));
    } catch (err) {
      err.message = `Fail encode '${filename}'. ${err.message}[${content}]`;
      throw err;
    }
  }
  encodeJSON<T = unknown>(content: string) {
    return JSON.parse(content) as T;
  }
  encodeJSON5<T = unknown>(content: string) {
    return json5.parse(content) as T;
  }
  encodeYAML<T = unknown>(content: string) {
    return yaml.parse(content) as T;
  }
}
