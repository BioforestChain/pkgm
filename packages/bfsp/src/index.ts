/// <reference path="../typings/index.d.ts"/>
import "./@type";
export * from "../bin";
export { doBuild, installBuildDeps, writeBuildConfigs } from "../bin/build.core";
export { doDev } from "../bin/dev.core";
export * from "../bin/fmt.core";
export * from "../bin/shim";
export * from "../bin/terser/runner";
export * from "../bin/tsc/runner";
export * from "../bin/util";
export * from "../bin/vite/configFactory";
export * from "../bin/yarn/runner";
export * from "../bin/create.core";
export * from "./bfspConfig";
export * from "./buildService";
export * from "./configs/bfspUserConfig";
export * from "./configs/commonIgnore";
export * from "./configs/packageJson";
export * from "./configs/tsConfig";
export * from "./configs/viteConfig";
export * from "./consts";
export * from "./deps";
export * from "./logger";
export * from "./toolkit";
export * from "./tui/index";
// import {toPosixPath} from 'typings/index'
