export const BFS_PROJECT_ARG = Symbol('bfsProject');

export const PROFILE_LIST = {
  PLATFORM: ['android', 'ios', 'win32', 'darwin', 'linux'],
  JS_RUNTIME: ['web', 'webworker', 'node', 'nodeworker'],
  RUNTIME_MODE: ['dev', 'test', 'prod'],
  CHANNEL: ['alpha', 'beta', 'stable'],
} as const;
export const PROFILE_SET = {
  PLATFORM: new Set(PROFILE_LIST.PLATFORM),
  JS_RUNTIME: new Set(PROFILE_LIST.JS_RUNTIME),
  RUNTIME_MODE: new Set(PROFILE_LIST.RUNTIME_MODE),
  CHANNEL: new Set(PROFILE_LIST.CHANNEL),
};
