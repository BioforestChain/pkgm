import { createSuperLogger } from "./SuperLogger";

export const consoleLogger = createSuperLogger({
  prefix: "",
  infoPrefix: "i",
  warnPrefix: "⚠",
  errorPrefix: "𐄂",
  successPrefix: "✓",
  stdoutWriter: process.stdout.write.bind(process.stdout),
  stderrWriter: process.stderr.write.bind(process.stderr),
  clearScreen: console.clear,
  clearLine: () => {
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
  },
});
