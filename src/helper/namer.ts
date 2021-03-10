import { Injectable } from '@bfchain/util-dep-inject';

export type Env = { parentProjectName?: string; vars?: { [key: string]: string | undefined } };

type NoEmpty<T> = T extends undefined | null ? never : T;
class ObjGetter<T extends {}> {
  constructor(private _obj: T, public readonly objName: string) {}
  get<K extends keyof T>(key: K) {
    return this._obj[key];
  }
  forceGet<K extends keyof T>(key: K, reason: string = '$&') {
    const v = this._obj[key];
    if (v === null || v === undefined) {
      throw new TypeError(reason.replace(/\$\&/g, `no found key:'${key}' in ${this.objName}`));
    }
    return v as NoEmpty<T[K]>;
  }
}
/**
 * 命名者
 */
@Injectable()
export class Namer {
  private _parseGetter<T extends {}>(obj: T) {
    // return new (class X{
    //     getX<K in keyof T>(key:K){}
    //     // forceGet<key>(key){}
    // })
  }
  nameProject(sortName: string, env: Env = {}) {
    const { parentProjectName } = env;
    /// 有#符号，进入预解析
    if (sortName.includes('#')) {
      const varGetter = new ObjGetter(
        Object.assign({}, env.vars, { host: env.parentProjectName }),
        'env.var'
      );
      if (sortName === '#host#') {
        return varGetter.forceGet('host', `need parentProjectName to parse ${sortName}`);
      }
      sortName = sortName.replace(/\#([\w\W]+?)\#/g, (_, key) => {
        if (key === 'host') {
          return varGetter.forceGet(
            'parentProjectName',
            `need parentProjectName to parse '${_}' in '${sortName}'`
          );
        }
        return varGetter.forceGet(key);
      });
    }

    /// 对特殊字符进行转义或者位移

    let firstName = parentProjectName || '';
    // 如果有firstName，需要将其转化为带有域的模式
    firstName = this.getNamePrefix(firstName);

    /// 转义
    let lastName = sortName
      .replace(/_/g, '-')
      .replace(/[A-Z]+/g, (c) => '-' + c.toLocaleLowerCase());

    /// 遇到“域扩展符”
    const extendsDomainIndex = lastName.indexOf('@');
    if (extendsDomainIndex !== -1) {
      const extendsDomainName = lastName.slice(extendsDomainIndex + 1);
      if (extendsDomainIndex > 0) {
        lastName = lastName.slice(0, extendsDomainIndex - 1);
      } else {
        lastName = '';
      }
      if (firstName.startsWith('@')) {
        // 如果有域，合并到域中
        const pairs = firstName.split('/');
        if (pairs[0]) {
          pairs[0] += `-${extendsDomainName}`;
        } else {
          pairs[0] = extendsDomainName;
        }
        firstName = pairs.join('/');
      } else {
        // 如果没有域，创建新域
        firstName = `@${extendsDomainName}/${firstName}`;
      }
      if (lastName === '' && firstName.endsWith('-')) {
        firstName = firstName.slice(0, -1);
      }
    }

    return firstName + lastName;
  }

  getNamePrefix(firstName: string) {
    if (firstName) {
      if (!firstName.startsWith('@')) {
        firstName = `@${firstName}/`;
      } else {
        // 已经存在域，则使用`-`进行连接即可
        firstName += '-';
      }
    }
    return firstName;
  }
}
