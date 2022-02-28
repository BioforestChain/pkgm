import { defineCommand } from "@bfchain/pkgm-bfsp/bin";
import { getBfswPackageJson } from "@bfchain/pkgm-bfsp";
import chalk from "chalk";

defineCommand("version", {}, async (params, args) => {
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
});