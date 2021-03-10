import { Type } from 'yaml/util';

function deepFreeze(obj: any) {
  if (typeof obj === 'object') {
    for (const key in obj) {
      deepFreeze(obj[key]);
    }
    Object.freeze(obj);
  }
  return obj;
}
export const cjs = {
  compilerOptions: {
    composite: true,
    incremental: true,
    target: 'esnext',
    module: 'commonjs',
    lib: [
      'es5',
      'es2015',
      'es2017',
      'es2018',
      'es2019',
      'es2020',
      'es2015.iterable',
      'esnext.asynciterable',
    ],
    types: [],
    declaration: true,
    declarationMap: true,
    sourceMap: false,
    noEmitOnError: true,
    removeComments: true,
    forceConsistentCasingInFileNames: true,
    importsNotUsedAsValues: 'error',
    strict: true,
    strictBindCallApply: true,
    strictNullChecks: true,
    skipLibCheck: true,
    noImplicitAny: true,
    moduleResolution: 'node',
    esModuleInterop: true,
    newLine: 'lf',
    experimentalDecorators: true,
    emitDecoratorMetadata: true,
    downlevelIteration: true,
    transformPlugins: ['es2019'],
  },
};
export const cjsEs5 = JSON.parse(JSON.stringify(cjs));
Object.assign(cjsEs5.compilerOptions, {
  target: 'esnext',
  declaration: true,
  declarationMap: false,
  sourceMap: false,
  transformPlugins: ['es5'],
});

export const esm = JSON.parse(JSON.stringify(cjs));
Object.assign(esm.compilerOptions, {
  target: 'ESNext',
  module: 'ESNext',
});

export const esmEs6 = JSON.parse(JSON.stringify(esm));
Object.assign(esmEs6.compilerOptions, {
  declaration: true,
  declarationMap: false,
  sourceMap: false,
  transformPlugins: ['jsbi', 'es2016'],
});

export const esmEs5 = JSON.parse(JSON.stringify(esm));
Object.assign(esmEs5.compilerOptions, {
  declaration: true,
  declarationMap: false,
  sourceMap: false,
  transformPlugins: ['jsbi', 'es5'],
});

deepFreeze(cjs);
deepFreeze(cjsEs5);
deepFreeze(esm);
deepFreeze(esmEs6);
deepFreeze(esmEs5);

export function getTsconfigBase(target: 'cjs' | 'cjs-es5' | 'esm' | 'esm-es6' | 'esm-es5') {
  let config;
  switch (target) {
    case 'cjs':
      config = cjs;
      break;
    case 'cjs-es5':
      config = cjsEs5;
      break;
    case 'esm':
      config = esm;
      break;
    case 'esm-es6':
      config = esmEs6;
      break;
    case 'esm-es5':
      config = esmEs5;
      break;
  }
  if (!config) {
    throw new TypeError(`unknown tsconfig target ${target}`);
  }
  return JSON.parse(JSON.stringify(config));
}
