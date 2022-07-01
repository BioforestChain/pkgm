import "./bfsw.env.mjs";
import { buildCommand } from "./build.bin.mjs";
import { clearCommand } from "./clear.bin.mjs";
import { devCommand } from "./dev.bin.mjs";
import { initCommand } from "./init.bin.mjs";
import { createCommand } from "./create.bin.mjs";
import { versionCommand } from "./version.bin.mjs";
import { npmCommand } from "./npm.bin.mjs";
import { defineHelpCommand } from "./help.bin.mjs";

defineHelpCommand([
  //
  buildCommand,
  clearCommand,
  devCommand,
  initCommand,
  createCommand,
  versionCommand,
  npmCommand,
]);
