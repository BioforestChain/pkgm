import { EasyMap, PromiseOut } from "@bfchain/util";
import { cpus } from "node:os";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { ConcurrentTaskLimitter } from "../../util/concurrent_limitter.mjs";
import { $YarnListWorkerMessage } from "./worker.mjs";
const CPU_SIZE = cpus().length;

export const getYarnWorkerMjsPath = () => {
  return fileURLToPath(new URL("worker.mjs", import.meta.url));
};

const yarnListServices = EasyMap.from({
  creater(serviceId: string) {
    const yarnMjsPath = getYarnWorkerMjsPath();
    const yarnWorker = new Worker(yarnMjsPath, {
      argv: [],
      stdin: false,
      stdout: false,
      stderr: false,
      env: {},
    });
    const po = new PromiseOut<Worker>();
    const waitReady = (msg: unknown) => {
      if ((msg as any)?.type === "ready") {
        po.resolve(yarnWorker);
        yarnWorker.off("message", waitReady);
      }
    };
    yarnWorker.on("message", waitReady);
    const taskLimiter = new ConcurrentTaskLimitter(1);

    return { serviceId, yarnWorkerPromise: po.promise, taskLimiter };
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

export const runYarnListProd = async (cwd: string, options: { serviceId?: string } = {}) => {
  const service = getYarnService(options.serviceId);
  const task = await service.taskLimiter.genTask();
  try {
    const msg: $YarnListWorkerMessage = {
      cmd: "list-prod",
      data: { cwd },
    };
    const yarnWorker = await service.yarnWorkerPromise;
    yarnWorker.postMessage(msg);
    let res: $YarnListRes | undefined;
    const onMessage = (backMsg: any) => {
      if (backMsg.type === "data") {
        try {
          const data = JSON.parse(backMsg.data);
          if (data.type === "tree" && data.data.type === "list") {
            res = data;
          }
        } catch {}
      } else if (backMsg.type === "done") {
        yarnWorker.off("message", onMessage);
        task.resolve();
      }
    };
    yarnWorker.on("message", onMessage);
    await task.promise;
    return res;
  } finally {
    task.resolve();
  }
};

export type $YarnListRes = $YarnListRes.RootObject;

export namespace $YarnListRes {
  export interface Child {
    name: string;
    // color: string;
    // shadow: boolean;
    children?: Child[];
    depth: undefined;
  }

  export interface Tree {
    name: string;
    children: Child[];
    // hint?: any;
    // color: string;
    depth: number;
  }

  export interface Data {
    type: "list";
    trees: Tree[];
  }

  export interface RootObject {
    type: "tree";
    data: Data;
  }
}
