import { chalk } from "@bfchain/pkgm-base/lib/chalk.mjs";
import { getYarnPath } from "@bfchain/pkgm-base/lib/yarn.mjs";
import { $YarnListRes } from "@bfchain/pkgm-base/service/yarn/runner.mjs";
import { PromiseOut } from "@bfchain/pkgm-base/util/extends_promise_out.mjs";
import cp from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface RunYarnOption {
  root: string;
  onExit?: (done: boolean) => void;
  logger: PKGM.TuiLogger;
  rootPackageNameList?: string[];
}
export const linkBFChainPkgmModules = (root: string) => {
  const isBFChainPkgmModuleDir = (moduleDir: string) => {
    const packageJsonPath = path.join(moduleDir, "package.json");
    if (
      fs.existsSync(packageJsonPath) &&
      /* 有package.json的可能是dist，所以这里需要额外判断一下是不是有README.md，确保在根目录 */
      fs.existsSync(path.join(moduleDir, "README.md"))
    ) {
      try {
        const moduleName = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")).name as string;
        if (moduleName.startsWith("@bfchain/pkgm-") || moduleName === "@bfchain/pkgm") {
          return moduleName;
        }
      } catch {}
    }
  };
  /**
   * 找到执行文件对应的目录
   * 这里也许用 process.argv[1] 会更好？但这个值可能被篡改，我们可能无法确切知道真正的启动程序的入口 js 文件
   */
  let dirname = path.dirname(fileURLToPath(import.meta.url));
  while (true) {
    if (isBFChainPkgmModuleDir(dirname) !== undefined) {
      break;
    }
    const parentDirname = path.dirname(dirname);
    if (parentDirname === dirname) {
      dirname = "";
      break;
    }
    dirname = parentDirname;
  }
  if (dirname !== "") {
    const bfchainModulesDir = path.dirname(dirname);
    for (const folderName of fs.readdirSync(bfchainModulesDir)) {
      const moduleDirPath = path.join(bfchainModulesDir, folderName);
      const moduleName = isBFChainPkgmModuleDir(moduleDirPath);
      if (moduleName !== undefined) {
        /**
         * @warn 这里耦合了 传统 node_modules 文件夹寻址的规则
         */
        const destDir = path.join(root, "node_modules", moduleName);
        if (fs.existsSync(destDir)) {
          if (fs.realpathSync(destDir) === fs.realpathSync(moduleDirPath)) {
            continue;
          }
          fs.unlinkSync(destDir);
        }
        fs.mkdirSync(path.dirname(destDir), { recursive: true });
        fs.symlinkSync(moduleDirPath, destDir, "junction");
      }
    }
  }
};

export const runYarn: {
  (args: RunYarnOption & Required<Pick<RunYarnOption, "rootPackageNameList">>):
    | {
        stop(): void;
        afterDone: Promise<boolean>;
        success: true;
        yarnListRes: $YarnListRes.RootObject;
      }
    | {
        stop(): void;
        afterDone: Promise<boolean>;
        success: false;
        yarnListRes: undefined;
      };
  (args: RunYarnOption): {
    stop(): void;
    afterDone: Promise<boolean>;
    success: boolean;
    yarnListRes: $YarnListRes.RootObject | undefined;
  };
} = (args: RunYarnOption) => {
  let yarnRunSuccess = true;
  const donePo = new PromiseOut<boolean>();
  const ac = new AbortController();
  const ret = {
    stop() {
      ac.abort();
    },
    afterDone: donePo.promise,
    success: false,
    /**如果提供了rootPackageNameList对象，只要yarn install成功了，那么必然会有yarnListRes */
    yarnListRes: undefined as $YarnListRes | undefined,
  };

  (() => {
    const yarnPath = getYarnPath();
    if (ac.signal.aborted) {
      return;
    }
    const { root, logger } = args;

    // const proc = new Worker(yarnPath, {
    //   execArgv: [
    //     "install",
    //     "--json",
    //     // 这个参数一定要给，否则有些时候环境变量可能会被未知的程序改变，传递的环境变量会进一步改变默认 yarn install 的默认行为
    //     "--production=false",
    //   ],
    //   env: process.env,
    // });
    // ac.signal.addEventListener("abort", () => {
    //   proc.terminate();
    // });

    const proc = cp.spawn(
      "node",
      [
        yarnPath,
        "install",
        "--json",
        // 这个参数一定要给，否则有些时候环境变量可能会被未知的程序改变，传递的环境变量会进一步改变默认 yarn install 的默认行为
        "--production=false",
      ],
      { cwd: root, env: process.env, signal: ac.signal }
    );

    /**
     * 需要这个，是因为yarn有bug
     * 会连续出现多个 progressStart 而没有提供 progressEnd
     */
    let preProgressId = "";
    /**
     * 需要这个，是因为yarn有bug
     * progressEnd 之后还会提供 progressTick
     */
    const progressIdSet = new Set<string>();
    let currentStep = "";
    const onJsonLines = (chunk: Buffer) => {
      const Lines = String(chunk).trim().split("\n");
      for (const jsonLine of Lines) {
        try {
          const json = JSON.parse(jsonLine);
          switch (json.type) {
            case "step":
              logger.log(`[${json.data.current}/${json.data.total}] ${(currentStep = json.data.message)}`);
              break;
            case "activityStart":
              logger.loadingStart(json.data.id);
              break;
            case "activityTick":
              logger.loadingLog(json.data.id, json.data.name);
              break;
            case "activityEnd":
              logger.loadingEnd(json.data.id);
              break;
            case "progressStart":
              // 这里这样做，目的是为了只允许出现一个 yarn-progress
              if (preProgressId !== "") {
                logger.progressEnd(preProgressId);
                progressIdSet.delete(preProgressId);
                preProgressId = "";
              }
              logger.progressStart((preProgressId = json.data.id), json.data.total);
              progressIdSet.add(preProgressId);
              break;
            case "progressTick":
              if (progressIdSet.has(json.data.id)) {
                logger.progressLog(json.data.id, json.data.current, currentStep);
              }
              break;
            case "progressFinish":
              logger.progressEnd(json.data.id);
              progressIdSet.delete(preProgressId);
              preProgressId = "";
              break;
            case "success":
              logger.success(json.data);
              yarnRunSuccess = true;
              break;
            case "info":
              logger.info(json.data);
              break;
            case "warn":
            case "warning":
              logger.warn(json.data);
              break;
            case "error":
              logger.error(json.data);
              yarnRunSuccess = false;
              break;
            default:
              logger.warn(jsonLine);
          }
        } catch (err) {
          logger.error(jsonLine);
        }
      }
    };
    proc.stdout?.on("data", onJsonLines);
    proc.stderr?.on("data", onJsonLines);

    /// 有signal的话，一定要提供 error 监听，否则会抛出异常到全局
    proc.once("error", () => {
      yarnRunSuccess = false;
    });
    proc.once("exit", async () => {
      /// 将 @bfchain/pkgm 的所有包 link 到对应目录下
      linkBFChainPkgmModules(root);

      /// 如果可以，打印出 yarn list
      const rootPackageNameList = args.rootPackageNameList;
      if (yarnRunSuccess && rootPackageNameList !== undefined) {
        ret.yarnListRes = await printYarnList({
          root,
          logger,
          rootPackageNameList,
          signal: ac.signal,
        });
      }

      donePo.resolve((ret.success = yarnRunSuccess));
      args.onExit?.(yarnRunSuccess);
    });
  })();

  return ret as never /* 前面已经有类型约束了，这里跟着走就行 */;
};

interface RunYarnListOption {
  root: string;
  logger: PKGM.TuiLogger;
  rootPackageNameList: string[];
  signal: AbortSignal;
}

const printYarnList = async (args: RunYarnListOption) => {
  const yarnPath = getYarnPath();
  const { logger } = args;
  logger.log.pin("yarn-list", "list deps...");
  const listSpawn = cp.spawn("node", [yarnPath, "list", "--json"], {
    cwd: args.root,
    env: {},
    signal: args.signal,
  });
  for await (const chunk of listSpawn.stdout) {
    try {
      const data = JSON.parse(String(chunk)) as $YarnListRes;
      if (data.type === "tree" && data.data.type === "list") {
        const trees = data.data.trees;
        const group = groupTree(trees);
        const rootNames = new Set(args.rootPackageNameList);
        const logs = logTree(
          group.rootMap,
          group.allList,
          (tree) => rootNames.has(tree.sname),
          args.rootPackageNameList
        );
        logger.log.unpin("yarn-list");
        logger.clear();
        const title = chalk.cyanBright("Dependencies list by yarn");
        logger.log(title);
        logger.log(logs.join("\n"));
        return data;
      }
    } catch (err) {
      debugger;
    }
  }
};

type Tree = {
  name: string;
  children: Tree[];
  depth?: number;
  sname: string;
  version: string;
  rversion: string;
};
const logTree = (
  map: Map<string, Tree>,
  trees: Tree[],
  isRoot = (_tree: Tree) => true,
  rootPackageNameList: string[] = [],
  logs: string[] = [],
  prefix = "",
  depth = 2
) => {
  let filteredTree = trees.filter(isRoot);

  // 如果是bfsp,直接全部打印
  if (filteredTree.length === 0 && rootPackageNameList[0]) {
    filteredTree.push(...trees);
  }

  const lastTree = filteredTree.at(-1);

  for (const tree of filteredTree) {
    let treePrefix = prefix + "├─";
    let childPrefix = prefix + "│  ";
    if (tree.depth === 0) {
      logs.push(chalk.cyan(childPrefix));
    }
    if (lastTree === tree) {
      treePrefix = prefix + "└─";
      childPrefix = prefix + "   ";
    }

    if (tree.depth === 0) {
      logs.push(`${chalk.cyan(treePrefix)} ${chalk.bold.green(tree.sname)}\t${chalk.blue(tree.rversion)}`);
    } else {
      const rootTree = map.get(tree.sname)!;
      const isFullMatch = rootTree?.version === tree.version;
      if (isFullMatch) {
        logs.push(`${chalk.cyan(treePrefix)} ${tree.sname}\t${chalk.blue(tree.rversion)}`);
      } else {
        logs.push(
          `${chalk.cyan(treePrefix)} ${tree.sname}${chalk.italic.gray("@" + tree.rversion)}\t${chalk.blueBright(
            rootTree.version
          )}`
        );
      }
    }

    if (depth > 1) {
      const children = tree.children ?? map.get(tree.sname)?.children;
      if (children) {
        logTree(map, children, () => true, [], logs, childPrefix, depth - 1);
      }
    }
  }
  return logs;
};
const groupTree = (trees: $YarnListRes.Tree[], rootMap = new Map<string, Tree>(), allList: Tree[] = []) => {
  for (const item of trees) {
    genTree(item, (tree) => {
      allList.push(tree);
      if (tree.depth === 0) {
        rootMap.set(tree.sname, tree);
      }
    });
  }
  return { rootMap, allList };
};
const genTree = (item: $YarnListRes.Tree | $YarnListRes.Child, onGen: (tree: Tree) => void) => {
  const [_, sname, rversion] = item.name.match(/(.+)@(.+)/)!;
  const tree: Tree = {
    sname,
    rversion,
    version: rversion.replace(/^\^|^\~/, ""),
    depth: item.depth,
    name: item.name,
    children: (item.children ?? []).map((c) => genTree(c, onGen)),
  };
  onGen(tree);
  return tree;
};
