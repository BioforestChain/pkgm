import { Inject, Injectable } from '@bfchain/util-dep-inject';
import { Config } from '../../config';
import type { Plugin } from 'rollup';

@Injectable()
export class RollupAutoPolyfills implements PKGM.RollupPlugin {
  constructor(private config: Config) {}
  private patterns = [
    {
      name: 'inject-promise.finally',
      test: /\.[\s\n]*finally[\s\n]*\(/,
      shimCode: `if (!Promise.prototype.finally) {
          Promise.prototype.finally = function finallyPolyfill(callback) {
          /**
           * @type {PromiseConstructor}
           */
          const Ctor = this.constructor;
          return this.then(
              // then
              value => Ctor.resolve(callback()).then(_ => value),
              // catch
              error =>
              Ctor.resolve(callback()).then(_ => {
                  throw error;
              }),
          );
          };
      }`,
    },
    {
      name: 'inject-queueMicrotask',
      test: /queueMicrotask/,
      shimCode: `if (typeof queueMicrotask !== "function") {
        self["queueMicrotask"] = function queueMicrotaskPolyfill(callback) {
          Promise.resolve().then(callback);
        };
      }`,
    },
    {
      name: 'inject-global-and-gloablThis',
      test: /global/,
      shimCode: `if(typeof globalThis!=='object'){
          const gloabl = typeof self !== 'undefined'?self:this;
          gloabl['globalThis'] = gloabl;
      }
      if(typeof global!=='object'){
          globalThis.global = globalThis
      }`,
    },
  ];
  toPlugin(): Plugin {
    const intros = new Set();
    return {
      name: 'autoPolyfill',
      transform: (code, id) => {
        for (const pattern of this.patterns) {
          code = code.replace(pattern.test, (_) => {
            intros.add(pattern.shimCode);
            return _;
          });
        }
        return code;
      },
      intro() {
        return [...intros.values()].join('\n');
      },
    };
  }
}
