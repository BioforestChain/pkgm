import "./bfsw.env";
import { buildCommand } from "./build.bin";
import { devCommand } from "./dev.bin";
import { initCommand } from "./init.bin";
import { createCommand } from "./create.bin";
import { versionCommand } from "./version.bin";
import { npmCommand } from "./npm.bin";
import { defineHelpCommand } from "./help.bin";

defineHelpCommand([
  //
  buildCommand,
  devCommand,
  initCommand,
  createCommand,
  versionCommand,
  npmCommand,
]);
