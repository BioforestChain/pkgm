import type { Config } from '../helper/config';

export const settings = (config: Config) => {
  return {
    'typescript.tsdk': 'node_modules\\@bfchain\\devkit-tsc\\built',
    'files.exclude': {
      [`**/${config.projectShadowDirname}`]: true,
      '**/node_modules': true,
    },
  };
};
