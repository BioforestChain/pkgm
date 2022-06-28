import { chalk } from "@bfchain/pkgm-base/lib/chalk.mjs";
import { getYarnPath } from "@bfchain/pkgm-base/lib/yarn.mjs";
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
    if (fs.existsSync(packageJsonPath)) {
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
        if (fs.existsSync(destDir) === false) {
          fs.mkdirSync(path.dirname(destDir), { recursive: true });
          fs.symlinkSync(moduleDirPath, destDir, "junction");
        }
      }
    }
  }
};

export const runYarn = (args: RunYarnOption) => {
  let yarnRunSuccess = true;
  const donePo = new PromiseOut<boolean>();
  const ac = new AbortController();
  const ret = {
    stop() {
      ac.abort();
    },
    afterDone: donePo.promise,
  };

  (() => {
    const yarnPath = getYarnPath();
    if (ac.signal.aborted) {
      return;
    }
    const { root, logger } = args;

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
        runYarnList({
          root,
          logger,
          rootPackageNameList,
          signal: ac.signal,
        });
      }

      donePo.resolve(yarnRunSuccess);
      args.onExit?.(yarnRunSuccess);
    });
  })();

  return ret;
};

interface RunYarnListOption {
  root: string;
  logger: PKGM.TuiLogger;
  rootPackageNameList: string[];
  signal: AbortSignal;
}

const runYarnList = (args: RunYarnListOption) => {
  const yarnPath = getYarnPath();
  const { logger } = args;
  logger.log.pin("yarn-list", "list deps...");
  const listSpawn = cp.spawn("node", [yarnPath, "list", "--json"], {
    cwd: args.root,
    env: {},
    signal: args.signal,
  });
  listSpawn.stdout.on("data", (chunk) => {
    try {
      const data = JSON.parse(String(chunk));
      if (data.type === "tree" && data.data.type === "list") {
        const trees: Tree[] = data.data.trees;
        const treeMap = groupTree(trees);
        const rootNames = new Set(args.rootPackageNameList);
        const logs = logTree(treeMap, trees, (tree) => rootNames.has(tree.sname), args.rootPackageNameList);
        logger.log.unpin("yarn-list");
        logger.clear();
        const title = chalk.cyanBright("Dependencies list by yarn");
        logger.log(title);
        logger.log(logs.join("\n"));
      }
    } catch {}
  });
  return new Promise<boolean>((resolve) => {
    listSpawn.once("exit", () => {
      resolve(true);
    });
    /// 有signal的话，一定要提供 error 监听，否则会抛出异常到全局
    listSpawn.once("error", () => {
      resolve(false);
    });
  });
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
  isRoot = (tree: Tree) => true,
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
const groupTree = (trees: Tree[], map = new Map<string, Tree>()) => {
  for (const tree of trees) {
    const name_version = tree.name.match(/(@?[^@]+)@(.+)/);
    if (name_version) {
      tree.sname = name_version[1];
      tree.rversion = name_version[2];
      tree.version = tree.rversion.replace(/^\^|^\~/, "");
      //   console.log(name_version);
      if (tree.depth === 0) {
        map.set(tree.sname, tree);
      }
    }
    if (tree.children) {
      groupTree(tree.children, map);
    }
  }
  return map;
};
