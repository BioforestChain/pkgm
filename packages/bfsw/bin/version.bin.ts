import { chalk } from "@bfchain/pkgm-base/lib/chalk";
import { defineCommand, getBfswPackageJson } from "@bfchain/pkgm-bfsp";

export const versionCommand = defineCommand(
  "version",
  {
    description: "get bfsw version and dependencies.",
  },
  async (params, args) => {
    process.noDeprecation = true;
    const pkgm = getBfswPackageJson();

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
