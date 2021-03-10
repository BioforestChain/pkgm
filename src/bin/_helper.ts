export const parseArgv = (argv: string[], parserEmitterList: ArgParserEmitter<any>[]) => {
  for (const arg of argv) {
    for (const pe of parserEmitterList) {
      const matchInfo = pe.parser(arg);
      if (matchInfo.match) {
        pe.emitter(matchInfo.value);
        break;
      }
    }
  }
};

type ValueFormatter<T> = (v: string | boolean) => T;
type ArgParser<T> = (arg: string) => { match: true; value: T } | { match: false; value: undefined };
type ArgParserEmitter<T> = { parser: ArgParser<T>; emitter: (value: T) => void };
export const buildArgParserEmitter = <T>(
  key: string,
  valFormatter: ValueFormatter<T>,
  emitter: (value: T) => void
) => {
  const res: ArgParserEmitter<T> = {
    parser: buildArgParser(key, valFormatter),
    emitter,
  };
  return res;
};

export const buildArgParser = <T>(key: string, valFormatter: ValueFormatter<T>) => {
  const fullKey = `--${key}`;
  const fullKeyWithArg = `--${key}=`;
  return ((arg: string) => {
    if (arg === fullKey) {
      return { match: true, value: valFormatter(true) };
    } else if (arg.startsWith(fullKeyWithArg)) {
      const value = arg.slice(fullKeyWithArg.length);
      if (value === 'true') {
        return { match: true, value: valFormatter(true) };
      }
      if (value === 'false') {
        return { match: true, value: valFormatter(false) };
      }

      return { match: true, value: valFormatter(value) };
    }
    return { match: false, value: undefined };
  }) as ArgParser<T>;
};
export const boolValueFormater = (value: string | boolean) => {
  return typeof value === 'boolean' ? value : true;
};

export const enumValueFormater = <K extends string>(keys: Iterable<K>, yesKey?: K, noKey?: K) => {
  const keySet = new Set(keys);
  const keyList = [...keySet];
  const trueKey = yesKey === undefined ? keyList[0] : yesKey;
  const falseKey = noKey === undefined ? keyList[1] || trueKey : noKey;

  return (value: string | boolean) => {
    if (typeof value === 'boolean') {
      return value ? trueKey : falseKey;
    }
    return (keySet.has(value as K) ? value : trueKey) as K;
  };
};
