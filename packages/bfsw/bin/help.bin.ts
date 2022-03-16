import { defineCommand, defineDefaultCommand, CommandInfo } from "@bfchain/pkgm-bfsp/bin";
export const defineHelpCommand = (commandInfoList: readonly CommandInfo[]) => {
  const helpCommand = defineCommand(
    "help",
    {
      alias: ["--help"],
      args: [[{ type: "string", name: "command" }], []],
    } as const,
    async (params, args, ctx) => {
      const { chalk, logger: console } = ctx;
      if (args.length === 0) {
        console.group(`Usage:`);
        console.log(chalk.blue`bfsw <command>` + chalk.gray`\t[--params=...] [args...]`);
        console.log(chalk.blue`bfsw help <command>` + chalk.gray`\tdisplay help for command`);
        console.groupEnd();

        console.group("\nCommands:");
        for (const info of commandInfoList) {
          console.log(`${chalk.blue(info.name)}\t\t${chalk.gray(info.config.description ?? "")}`);
        }
        console.groupEnd();
        return;
      }
      for (const command of args) {
        const commandInfo = commandInfoList.find((info) => info.name === command);
        if (commandInfo === undefined) {
          console.error(`Command ${chalk.blue(command)} no found.`);
        } else {
          console.group(`Usage of ${chalk.blue(command)}:`);
          console.log(JSON.stringify(commandInfo.config, null, 2));
          console.groupEnd();
        }
      }
    }
  );
  defineDefaultCommand(helpCommand);
};
