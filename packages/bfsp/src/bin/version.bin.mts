import { chalk } from "@bfchain/pkgm-base/lib/chalk.mjs";
import { defineCommand } from "../bin.mjs";
import { getBfspPackageJson } from "../helper/path_getter.mjs";
import { helpOptions } from "./help.core.mjs";

export const versionCommand = defineCommand(
  "version",
  { description: helpOptions.version },
  async (params, args, ctx) => {
    const console = ctx.logger;
    process.traceDeprecation = false;

    const pkgm = getBfspPackageJson();

    console.log(chalk.bold(`${chalk.green(pkgm.name)}: ${pkgm.version}`));
    console.group(chalk.gray("Dependencies:"));

    const dependencies = pkgm.dependencies;

    for (const name in dependencies) {
      console.log(`${chalk.cyan(name)}: ${dependencies[name]}`);
    }
    console.groupEnd();
    process.exit(0);
  }
);
