#!/usr/bin/env node
import { ModuleStroge } from '@bfchain/util-dep-inject';
import { Complier } from '../core/complier';
import { Initer } from '../core/initer';
import { Publer } from '../core/publer';
import { Runner } from '../core/runner';
import { BFSProject } from '../helper/project';
import {
  boolValueFormater,
  enumValueFormater,
  buildArgParser,
  parseArgv,
  buildArgParserEmitter,
} from './_helper';
if (require.main === module) {
  const argv = process.argv.slice(2);
  const cmd = (argv[0] || '').startsWith('-') ? '' : argv.shift() || '';

  const moduleMap = new ModuleStroge();

  switch (cmd) {
    case 'runall':
    case 'run':
      const scriptname = argv.shift();
      if (!scriptname) {
        throw new TypeError('no script name to run.');
      }
      const arg_runall = cmd === 'runall';
      const runner = Runner.from(
        {
          bfsProject: BFSProject.from({}),
        },
        moduleMap
      );
      runner.doRun(scriptname, {
        runAll: arg_runall,
        argv,
      });
      break;
    case 'clean':
      {
        const bfsProject = BFSProject.from({}, moduleMap);
        const complier = Complier.from({ bfsProject }, moduleMap);
        complier.doClean();
      }
      break;
    case 'fix':
      {
        const initer = Initer.from(
          {
            bfsProject: BFSProject.from({ autoInit: false }, moduleMap),
          },
          moduleMap
        );
        let unuse = false;
        let miss = true;
        let warn = true;
        parseArgv(argv, [
          buildArgParserEmitter('unuse', boolValueFormater, (v) => (unuse = v)),
          buildArgParserEmitter('miss', boolValueFormater, (v) => (miss = v)),
          buildArgParserEmitter('warn', boolValueFormater, (v) => (warn = v)),
        ]);
        initer.checkImport({ unuse, miss, warn });
      }
      break;
    case 'rebuild':
    case 'build':
    case 'dev':
      {
        const arg_rebuild = cmd === 'rebuild'; // || cmd === 'r';
        const arg_build = cmd === 'build'; // || cmd === 'b';
        const arg_dev = cmd === 'dev'; // || cmd === 'd';
        let clean = arg_rebuild;
        let mode: 'prod' | 'dev' = arg_build || arg_rebuild ? 'prod' : 'dev';
        let watch = arg_dev;
        let autoInit = false;
        let rollup = mode === 'prod';
        parseArgv(argv, [
          buildArgParserEmitter('watch', boolValueFormater, (v) => (watch = v)),
          buildArgParserEmitter(
            'mode',
            enumValueFormater(['prod', 'dev'] as const),
            (v) => (mode = v)
          ),
          buildArgParserEmitter('clean', boolValueFormater, (v) => (clean = v)),
          buildArgParserEmitter('init', boolValueFormater, (v) => (autoInit = v)),
          buildArgParserEmitter('rollup', boolValueFormater, (v) => (rollup = v)),
        ]);

        const bfsProject = BFSProject.from({ autoInit }, moduleMap);
        const complier = Complier.from({ bfsProject }, moduleMap);
        complier.doComplie({
          mode,
          clean,
          watch,
          rollup,
        });
        if (watch) {
          process.stdin.on('data', (data) => {
            const dataStr = data.toString().trim();
            if (dataStr === 'r') {
              Initer.from(
                {
                  bfsProject: BFSProject.from({ autoInit: true }),
                },
                new ModuleStroge([], moduleMap)
              ).reLink();
            }
          });
        }
      }
      break;

    case 'init':
    case 'i':
    case '':
      {
        const arg_init = cmd === 'init' || cmd === 'i';
        let autoInit = arg_init;
        parseArgv(argv, [buildArgParserEmitter('init', boolValueFormater, (v) => (autoInit = v))]);

        const initer = Initer.from(
          {
            bfsProject: BFSProject.from({ autoInit }, moduleMap),
          },
          moduleMap
        );
        initer.doLink();
      }
      break;
    case 'publ':
      {
        const packageName = argv.shift();
        if(!packageName){
          throw new Error('no package to be published')
        }
        const publer = Publer.from(
          {
            bfsProject: BFSProject.from({ autoInit: false }),
          },
          moduleMap
        );
        publer.publish(packageName)
      }
      break;
    default:
      console.error(`unknown cmd: '${cmd}'`);
  }
}
