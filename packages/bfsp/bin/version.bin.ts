import { defineCommand } from "../bin";
import { require, fileIO } from "../src/toolkit";
import { getBfspPackageJson } from "./util";
import chalk from "chalk";

defineCommand("version", {}, async (params, args) => {
  process.noDeprecation = true;

  const pkgm = getBfspPackageJson();

  console.log(chalk.bold(`${chalk.green(pkgm.name)}: ${pkgm.version}`));
  console.group(chalk.gray("Dependencies:"));
  for (const depName in pkgm.dependencies) {
    const depVersion = JSON.parse((await fileIO.get(require.resolve(depName + "/package.json"))).toString()).version;
    console.log(`${chalk.cyan(depName)}: ${depVersion}`);
  }
  console.groupEnd();
  process.exit(0);
});
