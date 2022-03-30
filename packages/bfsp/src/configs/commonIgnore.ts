export type IgnoreRules = Set<string>;

export const defaultIgnores = new Set([
  ".npm",
  ".vscode",
  ".bfsp",
  "node_modules",
  ".gitignore",
  "*.tsbuildinfo",
  ".npmignore",
  ".*.ts",
  "*.log",
  "*.tmp",
  "typings/dist",
  "typings/dist.d.ts",
  "tsconfig.isolated.json",
  "tsconfig.typings.json",
  "tsconfig.json",
  "package.json",
  "yarn.lock",
]);

export const effectConfigIgnores = (ignoreRules: IgnoreRules, ignoreConfig?: Bfsp.IgnoreUserConfig) => {
  if (ignoreConfig !== undefined) {
    if (Array.isArray(ignoreConfig)) {
      ignoreConfig = {
        include: ignoreConfig,
      };
    }
    ignoreRules = new Set(ignoreRules);
    if (Array.isArray(ignoreConfig.include)) {
      for (const rule of ignoreConfig.include) {
        ignoreRules.add(rule);
      }
    }
    if (Array.isArray(ignoreConfig.exclude)) {
      for (const rule of ignoreConfig.exclude) {
        ignoreRules.delete(rule);
      }
    }
  }
  return ignoreRules;
};
