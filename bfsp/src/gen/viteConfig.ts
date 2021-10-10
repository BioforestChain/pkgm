import type { BfspUserConfig } from "../userConfig";
import path from "node:path";
// import viteConfigTemplate from "../../assets/vite.config.template.ts?raw";

export const generateViteConfig = async (
  projectDirpath: string,
  config?: BfspUserConfig
) => {
  // let viteConfigContent = viteConfigTemplate;

  const exports = config?.exports;
  const viteInput: {
    [entryAlias: string]: string;
  } = {};
  let mainName = "index";
  let mainEntry = "index.ts";
  if (exports) {
    /// 先暴露出其它模块
    for (const key in exports) {
      if (key !== "." && !key.startsWith("..") && key !== "./") {
        viteInput[path.posix.normalize(key)] = path.join(
          projectDirpath,
          (exports as any)[key]
        );
      }
    }
    /// 再暴露出主模块
    mainEntry = exports["."];
    let autoNameAcc = 0;
    do {
      mainName = autoNameAcc === 0 ? "index" : `index-${autoNameAcc}`;
      if (viteInput[mainName] === undefined) {
        viteInput[mainName] = path.join(projectDirpath, mainEntry);
        break;
      }
      ++autoNameAcc;
    } while (true);

    // viteConfigContent = viteConfigContent.replace(
    //   "/*@EXPORTS@*/",
    //   Object.entries(viteInput)
    //     .map(([key, entry]) => `"${key}":"${entry}"`)
    //     .join(",\n")
    // );
  }
  return {
    viteInput,
    mainEntry,
    mainName,
    // viteConfigContent,
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
