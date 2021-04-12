import { Inject, Injectable, ModuleStroge, Resolve } from '@bfchain/util-dep-inject';
import { BFS_PROJECT_ARG } from '../helper/const';
import { BFSProject } from '../helper/project';
import { Reader } from '../helper/reader';
import { ConsolePro, chalk } from 'console-pro';
import * as execa from 'execa';
import { PathHelper } from '../helper/pathHelper';
import { Config } from '../helper/config';
import { EnvHelper } from '../helper/envHelper';

/**
 * 推送者，将项目的某一版本正式对外发布出去
 */
@Injectable()
export class Runner {
  static ARGS = {
    BFS_PROJECT: BFS_PROJECT_ARG,
  };
  static from(args: { bfsProject: BFSProject }, moduleMap = new ModuleStroge()) {
    moduleMap.set(Runner.ARGS.BFS_PROJECT, args.bfsProject);
    return Resolve(Runner, moduleMap);
  }
  constructor(
    @Inject(Runner.ARGS.BFS_PROJECT)
    public readonly bfsProject: BFSProject,
    private reader: Reader,
    private config: Config,
    private path: PathHelper,
    private env: EnvHelper
  ) {
    //   this.bfsProject.
  }

  async doRun(
    scriptname: string,
    options: { runAll?: boolean; argv?: string[]; listAll?: boolean } = {}
  ) {
    let scriptInfoList = this.bfsProject.findScript(scriptname);
    const { argv = [], runAll = false, listAll = false } = options;

    if (scriptInfoList.length === 0) {
      console.error(
        chalk.red(
          `no found script '${scriptname}' in project '${this.bfsProject.projectConfig.name}'`
        )
      );
      return;
    }

    if (listAll) {
      scriptInfoList.forEach((scriptInfo, i) => {
        // return {
        //   num: i + 1,
        //   project: chalk.green(scriptInfo.project.projectConfig.name),
        //   'command name': scriptInfo.script.name,
        //   description: scriptInfo.script.description,
        // };
        console.log(
          `${(i + 1).toString().padStart(2, ' ')}. ${chalk.green(
            scriptInfo.project.projectConfig.name
          )} ${chalk.blue(scriptInfo.script.name)}${
            scriptInfo.script.description ? chalk.grey(`\t: ${scriptInfo.script.description}`) : ''
          }`
        );
      });
      return;
    }

    if (runAll === false && scriptInfoList.length > 1) {
      const console = new ConsolePro();
      const memu = console.menu('select an script to run:');
      scriptInfoList.forEach((scriptInfo, i) => {
        memu.addOption(
          `${chalk.green(scriptInfo.project.projectConfig.name)} ${scriptInfo.script.name}${
            scriptInfo.script.description ? chalk.grey(` :${scriptInfo.script.description}`) : ''
          }`,
          i
        );
      });
      const selectedOption = await memu.selected_option;

      scriptInfoList = [scriptInfoList[selectedOption.value]];
    }

    for (const scriptInfo of scriptInfoList) {
      /// 基础的常量
      const innerEnv = this.env.getInnerEnv(scriptInfo.project.projectConfig);

      const command = this.env.resolveWithEnv(
        scriptInfo.script.command + (argv.length > 0 ? ` ${argv.join(' ')}` : ''),
        innerEnv
      );

      /// 参考npm-runscript的兼容性实现
      const isWindows = process.env.__FAKE_TESTING_PLATFORM__ || process.platform;
      const delimiter = isWindows ? ';' : ':';
      const npm_bin = this.path.join(
        this.bfsProject.projectDirname,
        this.config.projectShadowDirname,
        'node_modules',
        '.bin'
      );
      let pathKey = '';
      const pathArr = [npm_bin];
      for (const key in process.env) {
        if (/^path$/i.test(key)) {
          pathKey = key;
          pathArr.unshift(...process.env[key]!.split(delimiter));
          break;
        }
      }
      if (!pathKey) {
        pathKey = 'Path';
      }

      console.info(
        `${chalk.blue('[run script]')}: ${chalk.green(scriptInfo.project.projectConfig.name)} ${
          scriptInfo.script.name
        }`
      );

      execa.commandSync(command, {
        cwd: scriptInfo.project.projectDirname,
        stdio: 'inherit',
        env: Object.assign(
          innerEnv,
          {
            [pathKey]: pathArr.join(delimiter),
          },
          scriptInfo.script.env
        ),
      });
    }
  }
}
