import { Injectable } from '@bfchain/util-dep-inject';
import { cacheGetter } from '@bfchain/util-decorator';
import * as path from 'path';

@Injectable()
export class PathHelper {
  @cacheGetter
  get join() {
    return path.join;
  }
  @cacheGetter
  get resolve() {
    return path.resolve;
  }
  get relative() {
    return path.relative;
  }
  @cacheGetter
  get parse() {
    return path.parse;
  }
  get format() {
    return path.format;
  }
  @cacheGetter
  get sep() {
    return path.sep;
  }
  @cacheGetter
  get cwd() {
    return process.cwd();
  }
  relativeCwd(to: string) {
    return this.relative(this.cwd, to);
  }
}
