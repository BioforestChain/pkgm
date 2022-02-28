import { defineCommand } from "../bin";

defineCommand("--help", {}, async (params, args) => {
  console.log("Usage: bfsp <command> [options]\n");
  console.log("single project compiles multiple profiles code.\n");
  console.log("Options:");
  console.log("   --help\t\t\t\tdisplay help for command\n");
  console.log("Commands:");
  console.log("   create [options] <name>\t\tcreate a new bfsp project.\r");
  console.log("   init [options]\t\t\tinstall dependencies for bfsp project.\r");
  console.log("   dev [options] <path>\t\t\tenable bfsp project developmer mode, monitor code modifications in real-time.\r");
  console.log("   build [options] <path>\t\tbundle multiple profiles code.\r");
  console.log("   version\t\t\t\tget bfsp version and dependencies.\r\n");

  process.exit(0);
});
