/// <reference path="../typings/index.d.ts"/>
import "./@type";
export * from "./configs/bfspUserConfig";
export * from "./configs/tsConfig";
export * from "./configs/packageJson";
export * from "./configs/commonIgnore";
export * from "./configs/viteConfig";
export * from "./consts";
export * from "./bfspConfig";
export * from "./toolkit";
export * from "./logger";
export * from "./deps";
export * from "./buildService";
export * from "./tui/index";
export * from "../bin/shim";
export * from "../bin/util";
export * from "../bin/fmt.core";
export * from "../bin/terser/runner";
export * from "../bin/tsc/runner";
export * from "../bin/vite/configFactory";
export { doBuild, writeBuildConfigs, installBuildDeps } from "../bin/build.core";
// import {toPosixPath} from 'typings/index'
