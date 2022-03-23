import { PromiseOut } from "@bfchain/pkgm-base/util/extends_promise_out";
import { toPosixPath } from "@bfchain/pkgm-bfsp";
import path from "node:path";

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
export const pathToKey = (root: string, p: string) => {
  let relativePath = p;
  if (path.isAbsolute(p)) {
    relativePath = path.relative(root, p);
  }
  if (relativePath === "") {
    relativePath = ".";
  }
  return toPosixPath(relativePath);
};
