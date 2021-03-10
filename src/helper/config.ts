import { Injectable } from '@bfchain/util-dep-inject';

@Injectable()
export class Config {
  readonly projectConfigFilename = 'bfsp.json'; //['bfs-project.json', 'bfs-project.yaml'];
  readonly projectShadowDirname = '.bfsp';
  readonly shadownRootPackageDirname = 'packages';
  readonly shadownProjectSourceDirname = 'src';
  readonly rollupOutputDirname = `build/rollup`;
}
