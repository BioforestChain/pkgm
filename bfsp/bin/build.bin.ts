import { PromiseOut } from "@bfchain/util-extends-promise-out";
import { copyFile } from "node:fs/promises";
import path from "node:path";
import { defineCommand } from "../bin";
import { $BfspUserConfig, Closeable } from "../src";
import { Warn } from "../src/logger";
import { initMultiRoot, multiTsc, multiUserConfig } from "../src/multi";
import { doBuild } from "./build.core";

defineCommand(
  "build",
  {
    params: [
      { type: "string", name: "format", description: "bundle format: esm or cjs, default is esm." },
      { type: "string", name: "profiles", description: "bundle profiles, default is ['default']." },
    ],
    args: [[{ type: "string", name: "path", description: "project path, default is cwd." }], []],
  } as const,
  (params, args) => {
    const warn = Warn("bfsp:bin/build");

    const profiles = params?.profiles?.split(",") || [];
    if (profiles.length === 0) {
      profiles.push("default");
    }
    console.log(args);
    let root = process.cwd();
    let maybeRoot = args[0];
    if (maybeRoot !== undefined) {
      root = path.resolve(root, maybeRoot);
    }

    const pathMap = new Map<string, $BfspUserConfig>();
    const buildClosable = Closeable("bfsp:bin/build", async (reasons) => {
      console.log(reasons);
      const closeSign = new PromiseOut<unknown>();
      (async () => {
        if (closeSign.is_finished) {
          return;
        }
        for await (const [p, cfg] of pathMap) {
          if (closeSign.is_finished) {
            break;
          }
          await doBuild({ root: p, cfg });
        }
      })();

      return (reason: unknown) => {
        closeSign.resolve(reason);
      };
    });
    let isTscStarted = false;
    multiUserConfig.registerAll(async (e) => {
      const dir = path.dirname(e.path!);

      if (e.type === "unlink") {
        pathMap.delete(dir);
      } else {
        const cfg = await multiUserConfig.getUserConfig(e.path);
        if (!cfg) {
          return;
        }
        pathMap.set(dir, cfg);
        if (!isTscStarted) {
          if (e.path === ".") {
            console.log(`running tsc on root: ${dir}`);
            // await copyFile(
            //   path.resolve(path.join(e.path, "tsconfig.json")),
            //   path.resolve(path.join(e.path, "tsconfig.build.json"))
            // );
            await multiTsc.build({
              tsConfigPath: path.resolve(path.join(e.path, "tsconfig.json")),
              onSuccess: () => {
                buildClosable.restart("multi structure change");
              },
            });
            buildClosable.start("init");
            isTscStarted = true;
          }
        }
      }
    });
    initMultiRoot(root);
  }
);
