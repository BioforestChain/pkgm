import type { RollupWatcher as R } from "rollup";
import { build } from "@bfchain/pkgm-base/lib/vite";
export const buildBfsp = build;
export type RollupWatcher = R;
