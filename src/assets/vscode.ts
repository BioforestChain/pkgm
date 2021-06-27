import type { Config } from '../helper/config';

export const settings = (config: Config) => {
  return {
    'files.exclude': {
      [`**/${config.projectShadowDirname}`]: true,
      '**/node_modules': true,
      'tsconfig.json': true,
    },
  };
};
