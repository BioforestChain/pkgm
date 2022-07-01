import path from "node:path";
import { require } from "@bfchain/pkgm-base/toolkit/toolkit.require.mjs";
export const getBfspDir = () => {
  const pkg = require.resolve("@bfchain/pkgm-bfsp/package.json");
  return path.dirname(pkg);
};

export const getBfswDir = () => {
  const pkg = require.resolve("@bfchain/pkgm-bfsw/package.json");
  return path.dirname(pkg);
};
export const getBfspWorkerDir = () => {
  return path.join(getBfspDir(), "build/worker");
};
export const getBfspPackageJson = () => {
  return require("@bfchain/pkgm-bfsp/package.json");
};
export const getBfspVersion = () => {
  const version = getBfspPackageJson().version;
  return version as string;
};

export const getBfswPackageJson = () => {
  return require("@bfchain/pkgm-bfsw/package.json");
};
export const getBfswVersion = () => {
  return getBfswPackageJson().version;
};
