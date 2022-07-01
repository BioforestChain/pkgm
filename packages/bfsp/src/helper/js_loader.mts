import { PromiseOut } from "@bfchain/pkgm-base/util/extends_promise_out.mjs";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { pathToFileURL } from "node:url";

declare module "node:vm" {
  class Module {
    context: any;
    namespace: any;
    identifier: string;
    status: "unlinked" | "linking" | "linked" | "evaluated" | "evaluating" | "errored";
    error?: any;
    evaluate(options?: { timeout?: number; breakOnSigint?: boolean }): Promise<void>;
    link(linker: Linker): Promise<void>;
  }

  type Linker = (specifier: string, referencingModule: Module, extra: {}) => BFChainUtil.PromiseMaybe<Module>;
  class SourceTextModule extends Module {
    constructor(code: string, options: { content: any });
    createCachedData(): Buffer;
  }
}
export const $readFromMjs2 = async <T extends unknown>(filename: string, logger: PKGM.Logger, refresh?: boolean) => {
  const { SourceTextModule, createContext, Module } = await import("node:vm");

  /// 简单用logger覆盖console
  const customConsole = Object.create(console);
  customConsole.log = logger.log;
  customConsole.info = logger.info;
  customConsole.warn = logger.warn;
  customConsole.error = logger.error;

  const ctx = createContext({
    console: customConsole,
  });
  const script = new SourceTextModule(readFileSync(filename, "utf-8"), { content: ctx });
  await script.link(async (specifier) => {
    const context = await import(specifier);
    const module = new Module();
    module.context = context;
    return module;
    throw new Error(`Unable to resolve dependency: ${specifier}`);
  });
  await script.evaluate();

  const { default: config } = script.namespace;
  return config as T;
};

export const $readFromMjs = async <T extends unknown>(filename: string, logger: PKGM.Logger, unlink?: boolean) => {
  const url = pathToFileURL(filename);
  url.searchParams.append("_", Date.now().toString());

  try {
    const { default: config } = await import(url.href);
    return config as T;
  } catch (err) {
    logger.error(err);
  } finally {
    if (unlink) {
      existsSync(filename) && unlinkSync(filename);
    }
  }
};

export const DebounceLoadConfig = <T extends unknown>(filepath: string, logger: PKGM.TuiLogger, debounce = 50) => {
  // const debounce  = 50
  type LoadConfigTask = {
    status: "debounce" | "loading" | "end";
    task: PromiseOut<T | undefined>;
    fileContent: string;
  };
  const loadConfigTaskList: LoadConfigTask[] = [];
  const loadConfig = async () => {
    const preTask = loadConfigTaskList[loadConfigTaskList.length - 1];
    /// 如果在 debounce 中，说明代码还没执行，同时这个返回值已经被别人接手返回了，所以直接返回空就行
    if (preTask?.status === "debounce") {
      return;
    }

    /// 否则直接创建一个新的任务
    const newTask: LoadConfigTask = {
      status: "debounce",
      task: new PromiseOut(),
      fileContent: "",
    };
    loadConfigTaskList.push(newTask);
    setTimeout(async () => {
      newTask.status = "loading";
      /// 加载脚本内容
      newTask.fileContent = readFileSync(filepath, "utf-8");
      /// 和上一次对比，如果脚本内容一样，那么不需要执行，直接返回空
      if (newTask.fileContent === preTask?.fileContent) {
        newTask.task.resolve(undefined);
        return;
      }

      const newConfig = await $readFromMjs<T>(filepath, logger, true);
      newTask.status = "end";
      newTask.task.resolve(newConfig);
    }, debounce);
    return newTask.task.promise;
  };
  return loadConfig;
};
