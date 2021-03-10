import { Inject, Injectable } from '@bfchain/util-dep-inject';
import * as util from 'util';
import { BFS_PROJECT_ARG } from './const';
import { PathHelper } from './pathHelper';
import { BFSProject } from './project';
import { chalk } from 'console-pro';
import { bindThis } from '@bfchain/util-decorator';
import { ConsolePro } from 'console-pro';
const console = new ConsolePro();

const CUSTOM_INSPECT = Symbol.for('nodejs.util.inspect.custom');

@Injectable()
class CustomInspect {
  constructor(
    @Inject(BFS_PROJECT_ARG)
    private rootBfsProject: BFSProject,
    private _path: PathHelper
  ) {}
  @bindThis
  path(path: string) {
    return chalk.cyan(this._path.relative(this.rootBfsProject.projectDirname, path));
    // return {
    //   [CUSTOM_INSPECT]: () => {
    //     return chalk.green(this._path.relative(this.rootBfsProject.projectDirname, path));
    //   },
    // };
  }
}
@Injectable()
export class Logger {
  constructor(public readonly $: CustomInspect) {}
  private _format = util.format;
  private _withTime(format: string) {
    const time = new Date().toTimeString();
    const simpleTime = time.slice(0, time.indexOf(' '));
    return `[${chalk.gray(simpleTime)}] ${format}`;
  }
  debug(format: string, ...args: unknown[]) {
    console.debug(this._withTime(chalk.gray(format)), ...args);
  }
  info(format: string, ...args: unknown[]) {
    console.info(this._withTime(chalk.cyan(format)), ...args);
  }
  warn(format: string, ...args: unknown[]) {
    console.warn(this._withTime(chalk.yellow(format)), ...args);
  }
  error(format: string, ...args: unknown[]) {
    console.error(this._withTime(chalk.red(format)), ...args);
  }
  success(format: string, ...args: unknown[]) {
    console.log(this._withTime(chalk.green(format)), ...args);
  }
}
