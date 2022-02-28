import { defineCommand } from "../bin";
import { getBfspPackageJson } from "./util";
import chalk from "chalk";

defineCommand("version", {description:"get bfsp version and dependencies."}, async (params, args) => {
  process.noDeprecation = true;

  const pkgm = getBfspPackageJson();

  console.log(chalk.bold(`${chalk.green(pkgm.name)}: ${pkgm.version}`));
  console.group(chalk.gray("Dependencies:"));

  const dependencies = pkgm.dependencies;

  for (const name in dependencies) {
    console.log(`${chalk.cyan(name)}: ${dependencies[name]}`);
  }
  console.groupEnd();
  process.exit(0);
});
