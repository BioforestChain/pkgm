import path from "node:path";
import { SharedAsyncIterable, SharedFollower } from "../toolkit";
// import viteConfigTemplate from "../../assets/vite.config.template.ts?raw";

/**为出口的js文件进行自动重命名,寻找一个不冲突的文件名
 * input 与 output 一一对应
 * 但是input可以有别名,这些别名决定着output
 * 别名可以一样
 */
export class ExportsMap {
  readonly oi_cache = new Map<string, string>();
  readonly io_cache = new Map<string, string>();
  hasDefine(input: string) {
    return this.io_cache.has(input);
  }
  define(input: string, output: string) {
    this.oi_cache.set(output, input);
    this.io_cache.set(input, output);
  }
  autoDefine(input: string, inputAlias: string) {
    let output = this.oi_cache.get(input);
    if (output !== undefined) {
      return output;
    }
    let autoNameAcc = 0;
    do {
      output = autoNameAcc === 0 ? inputAlias : `${inputAlias}-${autoNameAcc}`;
      if (this.oi_cache.has(output) === false) {
        break;
      }

      autoNameAcc += Math.ceil(this.oi_cache.size / 2);
    } while (true);

    this.define(input, output);
    return output;
  }
  getDefine(input: string) {
    return this.io_cache.get(input);
  }
  delDefine(input: string) {
    const output = this.io_cache.get(input);
    if (output !== undefined) {
      this.io_cache.delete(input);
      this.oi_cache.delete(output);
      return true;
    }
    return false;
  }
}

export const generateViteConfig = async (
  projectDirpath: string,
  userConfig: Bfsp.UserConfig
  // tsConfig:$TsConfig
) => {
  // let viteConfigContent = viteConfigTemplate;

  const exports = userConfig?.exports;

  const exportsMap = new ExportsMap();

  // let mainName = "index";
  let _index: { posixKey: string; input: string; key: string } | undefined;
  if (exports) {
    /// 先暴露出模块
    for (const key in exports) {
      /**一个格式化后的key, 是用于提供 @bfchain/xxx/{key} 这样的扩展包的 */
      const posixKey = path.posix.normalize(key);
      if (posixKey.startsWith("..")) {
        console.error(`invalid exports key: '${key}'`);
        continue;
      }
      const input: string = (exports as any)[key];

      let inputAlias = posixKey;
      if (posixKey === "." || posixKey === "./" || posixKey === "") {
        inputAlias = "index";
        if (_index !== undefined) {
          console.error(
            `duplicated default export: '${posixKey}', will use '.' by default`
          );
          if (_index.posixKey === ".") {
            continue;
          }
          exportsMap.delDefine(_index.input);
        }
        _index = { posixKey, input, key };
      }

      exportsMap.autoDefine(input, posixKey);
    }
  }

  if (_index === undefined) {
    throw new Error("no found default export");
  }

  const viteInput: {
    [entryAlias: string]: string;
  } = {};
  for (const [output, input] of exportsMap.oi_cache) {
    viteInput[output] = path.join(projectDirpath, input);
  }

  return {
    viteInput,
    exportsMap,
    indexFile: _index.input,
    indexKey: {
      sourceKey: _index.key,
      posixKey: _index.posixKey,
    },
  };
};
export type $ViteConfig = BFChainUtil.PromiseReturnType<
  typeof generateViteConfig
>;
// import { resolve } from "node:path";
// import { fileIO } from "../toolkit";
// export const writeViteConfig = (
//   projectDirpath: string,
//   viteConfig: $ViteConfig
// ) => {
//   return fileIO.set(
//     resolve(projectDirpath, "vite.config.ts"),
//     Buffer.from(viteConfig.viteConfigContent)
//   );
// };

export const watchViteConfig = (
  projectDirpath: string,
  userConfigStream: SharedAsyncIterable<Bfsp.UserConfig>
) => {
  const follower = new SharedFollower<$ViteConfig>();
  /// 循环处理监听到的事件
  let running = false;
  const loopProcesser = async () => {
    if (running) {
      return;
    }
    running = true;

    const userConfig = await userConfigStream.getCurrent();
    follower.push(await generateViteConfig(projectDirpath, userConfig));
  };

  //#region 监听依赖配置来触发更新
  userConfigStream.onNext(loopProcesser);
  //#endregion

  return new SharedAsyncIterable<$ViteConfig>(follower);
};
