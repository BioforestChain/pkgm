import { initMultiRoot, multiTsc, multiUserConfig } from "../src/multi";
import { defineCommand } from "../bin";
import { $BfspUserConfig, ALLOW_FORMATS, parseExports, parseFormats } from "../src/configs/bfspUserConfig";
import { Warn } from "../src/logger";
import { doDev } from "./dev.core";
import path from "node:path";

defineCommand(
  "dev",
  {
    params: [
      { type: "string", name: "format", description: "bundle format: esm or cjs, default is esm." },
      { type: "string", name: "profiles", description: "bundle profiles, default is ['default']." },
    ],
    args: [[{ type: "string", name: "path", description: "project path, default is cwd." }], []],
  } as const,
  (params, args) => {
    const warn = Warn("bfsp:bin/dev");
    let { format } = params;
    if (format !== undefined && ALLOW_FORMATS.has(format as any) === false) {
      warn(`invalid format: '${format}'`);
      format = undefined;
    }

    const profiles = params?.profiles?.split(",") || [];
    if (profiles.length === 0) {
      profiles.push("default");
    }

    let root = process.cwd();
    let maybeRoot = args[0];
    if (maybeRoot !== undefined) {
      root = path.resolve(root, maybeRoot);
    }
    const tasks = new Map<string, ReturnType<typeof doDev>>();
    const pendingTasks = [] as { dir: string; cfg: $BfspUserConfig }[];
    let isTscStarted = false;
    multiUserConfig.registerAll(async (e) => {
      const dir = e.path;
      if (e.type === "unlink") {
        const t = tasks.get(dir);
        (await t)?.close("project removed");
      } else {
        const cfg = await multiUserConfig.getUserConfig(e.path);
        if (!cfg) {
          return;
        }
        if (!isTscStarted) {
          if (e.path === ".") {
            multiTsc.dev({ tsConfigPath: path.resolve(path.join(e.path, "tsconfig.json")) });
            isTscStarted = true;
            let x = pendingTasks.shift();
            while (x) {
              tasks.set(
                x.dir,
                doDev({ format: format as Bfsp.Format, root: path.resolve(x.dir), profiles, cfg: x.cfg })
              );
              x = pendingTasks.shift();
            }
          } else {
            pendingTasks.push({ dir, cfg });
          }
        } else {
          if (tasks.has(dir)) {
            return;
          }
          console.log(`running task for ${dir}`);
          tasks.set(dir, doDev({ format: format as Bfsp.Format, root: path.resolve(dir), profiles, cfg }));
        }
      }
    });
    initMultiRoot(root);
  }
);
