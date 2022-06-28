import "./bfsp.env";
import { buildCommand } from "./build.bin";
import { createCommand } from "./create.bin";
import { devCommand } from "./dev.bin";
import { initCommand } from "./init.bin";
import { testCommand } from "./test.bin";
import { versionCommand } from "./version.bin";
// import { npmCommand } from "./npm.bin";
// import {} from "./fmt.bin";
import { clearCommand } from "./clear.bin";
import { defineHelpCommand } from "./help.bin";

defineHelpCommand([
  //
  buildCommand,
  devCommand,
  initCommand,
  testCommand,
  versionCommand,
  createCommand,
  clearCommand,
  // npmCommand,
]);
