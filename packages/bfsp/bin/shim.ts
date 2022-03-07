import type { RollupWatcher as R } from "rollup";
import { build } from "vite";
export const buildBfsp = build;
export type RollupWatcher = R;