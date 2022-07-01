import { EasyMap } from "@bfchain/util";
import { cpus } from "node:os";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { Worker } from "node:worker_threads";
import { ConcurrentTaskLimitter } from "src/util/concurrent_limitter.mjs";
import { $YarnListWorkerMessage } from "./worker.mjs";
const CPU_SIZE = cpus().length;

export const getYarnWorkerMjsPath = () => {
  return fileURLToPath(new URL("worker.mjs", import.meta.url));
};

const yarnListServices = EasyMap.from({
  creater(serviceId: string) {
    let yarnMjsPath = getYarnWorkerMjsPath();
    const yarnWorker = new Worker(yarnMjsPath, {
      argv: [],
      stdin: false,
      stdout: false,
      stderr: false,
      env: {},
    });
    const taskLimiter = new ConcurrentTaskLimitter(1);

    return { serviceId, yarnWorker, taskLimiter };
  },
});

const getYarnService = (serviceId?: string) => {
  const service = serviceId !== undefined ? yarnListServices.get(serviceId) : undefined;
  if (service !== undefined) {
    return service;
  }
  /// 拾取一个空闲的服务
  for (const freeService of yarnListServices.values()) {
    if (freeService.taskLimiter.size === 0) {
      return freeService;
    }
  }
  /// 没有空闲的服务，但是cpu足够，那么构建一个新的空闲服务
  if (CPU_SIZE > yarnListServices.size) {
    serviceId ??= `cpu-${yarnListServices.size}`;
    return yarnListServices.forceGet(serviceId);
  } else {
    /// 否则寻找队列最小的服务
    return [...yarnListServices.values()].sort((a, b) => {
      return a.taskLimiter.size - b.taskLimiter.size;
    })[0];
  }
};

export const runYarnList = async (cwd: string, options: { serviceId?: string } = {}) => {
  const service = getYarnService(options.serviceId);
  const task = await service.taskLimiter.genTask();
  try {
    const msg: $YarnListWorkerMessage = {
      cmd: "list",
      data: { cwd },
    };
    service.yarnWorker.postMessage(msg);
    service.yarnWorker.once("message", (backMsg) => {
      if (isDeepStrictEqual(msg, backMsg)) {
        service.yarnWorker.stdout.off("data", onData);
        task.resolve();
      }
    });
    let res = "";
    const onData = (chunk: Buffer | string) => {
      res += chunk;
    };
    service.yarnWorker.stdout.on("data", onData);
    await task;
  } finally {
    task.resolve();
  }
};
