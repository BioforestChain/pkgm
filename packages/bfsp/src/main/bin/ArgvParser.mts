import "./@bin.types.mjs";
import { EasyMap } from "@bfchain/pkgm-base/util/extends_map.mjs";

/**
 * 将有关联的参数聚合在一起
 * 这里宽松地解析参数，不区分类型。
 * 我们会在所有的params解析完成后，去除掉那些有意义的params，将剩下交给args进行进一步解析
 */
const argsMapCache = EasyMap.from({
  creater: (argv: readonly string[]) => {
    const argsMap = EasyMap.from({
      creater: (_argName: string) => {
        return [] as string[];
      },
    });
    let curArgName = "";
    /**
     * 假设输入 --name a1 a2 a3
     * 这里不知道 name 的类型，所以会默认把 a1 a2 a3 都归类给 name
     * 之后再通过 getParamInfo 携带 type 来提取这些值（按需提取）
     * 最后再通过 freeParamInfo 来将剩余的值归类到 args 中去
     */
    for (const arg of argv) {
      const matchArgPrefix = arg.match(/^-+?(\w+)\=?/);
      if (matchArgPrefix !== null) {
        const [argPrefix, argName] = matchArgPrefix;
        curArgName = argName;
        let rawValue: undefined | string;
        if (argPrefix.endsWith("=")) {
          rawValue = arg.slice(argPrefix.length);
        }

        /// forceGet，确保创建出空数组，以代表字段过
        const rawValues = argsMap.forceGet(argName);
        /// 保存值
        if (typeof rawValue === "string") {
          rawValues.push(rawValue);
        }
      } else {
        argsMap.forceGet(curArgName).push(arg);
      }
    }
    return argsMap;
  },
});

export class ArgvParser {
  constructor(readonly argv: readonly string[]) {}
  private _argsMap = argsMapCache.forceGet(this.argv);

  freeParamInfo(name: string, aliases?: string[]) {
    this._freeParamValue(name);
    if (aliases !== undefined) {
      for (const alias of aliases) {
        this._freeParamValue(alias);
      }
    }
  }
  private _freeParamValue(name: string) {
    const argRawValues = this._argsMap.get(name);
    if (argRawValues === undefined) {
      return;
    }
    this._argsMap.forceGet("").push(...argRawValues);
    this._argsMap.delete(name);
  }

  private _findParamValue(name: string, type: Bfsp.Bin.CommandConfig.InputType) {
    const argRawValues = this._argsMap.get(name);
    if (argRawValues === undefined) {
      return undefined;
    }

    /**
     * 尝试根据类型获取所需的参数
     * 有符合规则的才会拿出来，不符合规则的会被保留
     */
    switch (type) {
      case "boolean": {
        const maybeBoolRawValue = argRawValues[0];
        if (typeof maybeBoolRawValue === "string") {
          const boolValue = maybeBoolRawValue.toLowerCase();
          if (
            boolValue === "n" ||
            boolValue === "no" ||
            boolValue === "f" ||
            boolValue === "false" ||
            boolValue === "y" ||
            boolValue === "yes" ||
            boolValue === "t" ||
            boolValue === "true"
          ) {
            return argRawValues.shift();
          }
        } else {
          return "yes";
        }
      }
      case "number": {
        const maybeNumberRawValue = argRawValues[0];
        if (typeof maybeNumberRawValue === "string") {
          const numValue = Number.parseFloat(maybeNumberRawValue);
          if (Number.isFinite(numValue)) {
            return argRawValues.shift();
          }
        }
        break;
      }
      case "string":
      default: {
        return (argRawValues.shift() ?? "").toLowerCase();
      }
    }
  }

  getParamInfo(name: string, aliases?: string[], type: Bfsp.Bin.CommandConfig.InputType = "string") {
    let result: { name: string; value: string } | undefined;

    /**
     * 这里需要把所有的alias全部解析一边，目的时把所有有含义的字段内容都
     * 根据优先级低到高解析，覆盖 result
     */
    for (const alias of [
      // alias 要逆序, 定义越靠前优先级越高
      ...(aliases ?? []).reverse(),
      name,
    ]) {
      const foundArg = this._findParamValue(alias, type);
      if (foundArg !== undefined) {
        result = { name: alias, value: foundArg };
      }
    }

    return result;
  }

  getArgs() {
    return this._argsMap.forceGet("");
  }
  argsEntries() {
    return this._argsMap.entries();
  }
}

export const formatTypedValue = (value: string, type?: Bfsp.Bin.CommandConfig.InputType) => {
  switch (type) {
    case "boolean":
      value = value.toLowerCase();
      if (value === "f" || value === "false" || value === "n" || value === "no") {
        return false;
      }
      return true; //(value === "true" || value === "yes" || value === "")
    case "number":
      const num = parseFloat(value);
      if (Number.isFinite(num)) {
        return num;
      }
      break;
    case "string":
    default:
      return value;
  }
};
