import { defineCommand } from "../bin";
import { helpOptions } from "./help.core";

defineCommand("--help", {}, async (params, args) => {
  console.log("Usage: bfsp <command> [options]\n");
  console.log(`${helpOptions.bfsp}\n`);
  console.log("Options:");
  console.log("   --help\t\t\t\tdisplay help for command\n");
  console.log("Commands:");
  console.log(`   create [options] <name>\t\t${helpOptions.create}\r`);
  console.log(`   init [options]\t\t\t${helpOptions.init}\r`);
  console.log(`   dev [options] <path>\t\t\t${helpOptions.dev}\r`);
  console.log(`   build [options] <path>\t\t${helpOptions.build}\r`);
  console.log(`   version\t\t\t\t${helpOptions.version}\r\n`);

  process.exit(0);
});
