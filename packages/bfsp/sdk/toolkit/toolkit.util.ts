import { PromiseOut } from "@bfchain/pkgm-base/util/extends_promise_out";

export const jsonClone = <T>(obj: T) => JSON.parse(JSON.stringify(obj)) as T;

export const joinMonoName = (rootName: string, packageName: string) => {
  let monoName: string;
  if (rootName.startsWith("@")) {
    monoName = `${rootName}-${packageName}`;
  } else {
    monoName = `@${rootName}/${packageName}`;
  }
  monoName = monoName
    // 处理大写
    .replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())
    // 处理下划线
    .replace(/_/g, "-")
    // 处理连续符号
    .replace("@-", "@")
    .replace(/-+/g, "-");
  return monoName;
};

export async function* ParallelRunner(max: number) {
  let waitter: PromiseOut<void> | undefined; // = new PromiseOut
  let remain = max;
  while (true) {
    for (; remain > 0; remain--) {
      const task = new PromiseOut<void>();
      task.onFinished(() => {
        remain++;
        if (waitter !== undefined) {
          waitter.resolve();
          waitter = undefined;
        }
      });
      yield task;
    }
    waitter = new PromiseOut();
    await waitter.promise;
  }
}

export function rearrange<T>(numContainer: number, items: T[], cb: (items: T[]) => void) {
  if (items.length < numContainer) {
    items.forEach((x) => cb([x]));
    return;
  }
  const avg = Math.floor(items.length / numContainer);
  const mod = items.length % numContainer;
  for (let i = 0; i < numContainer; i++) {
    const start = i * avg;
    const slicedItems = items.slice(start, start + avg);
    if (mod > 0 && i < mod) {
      slicedItems.push(items[items.length - mod + i]);
    }
    cb(slicedItems);
  }
}

/**
 * 解决对象循环引用 -> const obj = {};obj.name = obj;
 * 使用方法 const result = JSON.stringify(obj, getCircularReplacer());
 * @returns
 */
export const getCircularReplacer = () => {
  const seen = new WeakSet();
  return (_key: any, value: object | null) => {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) {
        return;
      }
      seen.add(value);
    }
    return value;
  };
};
