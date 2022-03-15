import { defineCommand } from "../bin";
import { helpOptions } from "./help.core";

defineCommand("help", { alias: ["--help"] }, async (params, args, ctx) => {
  const console = ctx.logger;
  console.log("Usage: bfsp <command> [options]\n");
  console.log(`${helpOptions.bfsp}\n`);
  console.log("Options:");
  console.log("   --help\t\t\t\tdisplay help for command\n");
  console.log("Commands:");
  console.log(`   create\t\t${helpOptions.create}`);
  console.log(`   init\t\t${helpOptions.init}`);
  console.log(`   dev\t\t${helpOptions.dev}`);
  console.log(`   build\t\t${helpOptions.build}`);
  console.log(`   npm\t\t${helpOptions.npm}`);
  console.log(`   version\t${helpOptions.version}`);

  process.exit(0);
});
