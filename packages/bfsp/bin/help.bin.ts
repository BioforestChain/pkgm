import { defineCommand, defineDefaultCommand, CommandInfo } from "../bin";
import { helpOptions } from "./help.core";
export const defineHelpCommand = (commandInfoList: readonly CommandInfo[]) => {
  const helpCommand = defineCommand("help", { alias: ["--help"] }, async (params, args, ctx) => {
    const { chalk, logger: console } = ctx;
    console.log("Usage: bfsp <command> [options]\n");
    console.log(`${helpOptions.bfsp}\n`);
    console.log("Options:");
    console.log("   --help\t\t\t\tdisplay help for command\n");
    console.group("Commands:");
    for (const info of commandInfoList) {
      console.log(`${chalk.blue(info.name)}\t\t${chalk.gray(info.config.description ?? "")}`);
    }
    console.groupEnd();
  });
  defineDefaultCommand(helpCommand);
};
