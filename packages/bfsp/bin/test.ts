import path from "node:path";
import { fileURLToPath } from "node:url";
import cp from "node:child_process";
import { require } from "../sdk/toolkit/toolkit.require";
export const doTest = async (options: {
  root?: string;
  tests?: string[];
  logger?: { outWrite: (str: string) => void; errWrite: (str: string) => void };
  debug?: boolean;
}) => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const { logger } = options;
  const pipeStdIo = logger !== undefined;

  const avaPath = require.resolve("ava", { paths: [options.root!] });
  const avaBinPath = path.join(path.dirname(avaPath), "cli.mjs");

  const proc = cp.exec(`node ${avaBinPath}`, { cwd: options.root });
  if (pipeStdIo) {
    proc.stdout?.on("data", (data) => {
      logger.outWrite(data);
    });
    proc.stderr?.on("data", (data) => {
      logger.errWrite(data);
    });
  }
  return new Promise<void>((resolve) => proc.on("exit", resolve));
};
