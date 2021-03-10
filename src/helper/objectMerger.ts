import { Injectable } from '@bfchain/util-dep-inject';
@Injectable()
export class ObjectMerger {
  private _mergeAble(value: unknown) {
    return typeof value === 'object' && value !== null && !(Symbol.iterator in value);
  }
  deepMixProxy<T extends object>(...objList: T[]): T {
    objList = objList.filter(this._mergeAble);
    if (objList.length === 0) {
      return {} as T;
    }
    if (objList.length === 1) {
      return objList[0];
    }
    /// 有多个对象，进入混合模式
    return new Proxy(objList[0], {
      get: (t, prop, r) => {
        const subObjList = objList.filter((obj) => Reflect.has(obj, prop));
        if (subObjList.length === 0) {
          return;
        }
        if (subObjList.length === 1) {
          return Reflect.get(subObjList[0], prop);
        }

        /// 如果有object，那么有限object
        const subObjValueList = subObjList.map((obj) => Reflect.get(obj, prop));
        const subSubObjValueList = subObjValueList.filter(this._mergeAble);
        /// 如果都是Primitive，那么直接返回最后一个就行了
        if (subSubObjValueList.length === 0) {
          return subObjValueList.pop();
        }
        /// 如果有非Promitive的，那么mix后返回
        return this.deepMixProxy(...subSubObjValueList);
      },
      getOwnPropertyDescriptor: (t, prop) => {
        const subObjList = objList.filter((obj) => Reflect.has(obj, prop));
        if (subObjList.length === 0) {
          return;
        }
        if (subObjList.length === 1) {
          return Reflect.getOwnPropertyDescriptor(subObjList[0], prop);
        }

        /// 如果有object，那么优先object，这里直接把值全部读取出来，不考虑getter和setter，因为set操作不带你，之反应到最终过滤出来的第一个obj身上
        const subObjTVList = subObjList.map((obj) => ({
          target: obj,
          value: Reflect.get(obj, prop),
        }));
        const subSubObjTVList = subObjTVList.filter((tv) => this._mergeAble(tv.value));

        const latestPd = Reflect.getOwnPropertyDescriptor(
          subObjTVList[subObjTVList.length - 1].target,
          prop
        );
        /// 如果都是Promitive，那么直接返回最后一个就行了
        if (subSubObjTVList.length === 0) {
          return latestPd;
        }
        /// 如果有非Promitive的，那么mix后返回
        return {
          ...latestPd,
          value: this.deepMixProxy(...subSubObjTVList.map(({ value }) => value)),
        };
      },
      ownKeys: () => {
        return [...new Set(objList.map((obj) => Reflect.ownKeys(obj)).flat())];
      },
    });
  }
}

// const z = new ObjectMerger();
// z.deepMixProxy({ a: 1 }, { a: 2, b: 2 });
// type Me<T> = T extends infer Y | infer X ? Y & X : T;
// type X = Me<
//   | {
//       a: number;
//       b?: undefined;
//     }
//   | {
//       b: number;
//       a: number;
//     }
// >;
