import { defineBin } from "../bin";
import { ALLOW_FORMATS } from "../src/configs/bfspUserConfig";
import { doDev } from "./dev";
import { Warn } from "../src/logger";

defineBin(
  "dev",
  {
    params: [
      { type: "string", name: "format", description: "bundle format: esm or cjs, default is esm." },
      { type: "string", name: "profiles", description: "bundle profiles, default is ['default']." },
    ],
    args: [[], [{ type: "string", name: "path", description: "project path, default is cwd." }]],
  } as const,
  (params, args) => {
    const warn = Warn("bfsp:bin/dev");
    let { format } = params;
    if (ALLOW_FORMATS.has(format as any) === false) {
      warn(`invalid format: '${format}'`);
      format = undefined;
    }

    const profiles = params?.profiles?.split(",") || [];
    if (profiles.length === 0) {
      profiles.push("default");
    }
    return doDev({ format: format as Bfsp.Format, cwd: args[0], profiles });
  }
);
