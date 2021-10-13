export type IgnoreUserConfig =
  | {
      include?: string[];
      exclude?: string[];
    }
  | string[];

export type IgnoreRules = Set<string>;

export const effectConfigIgnores = (
  ignoreRules: IgnoreRules,
  ignoreConfig?: IgnoreUserConfig
) => {
  if (ignoreConfig !== undefined) {
    if (Array.isArray(ignoreConfig)) {
      ignoreRules = new Set(ignoreConfig);
    } else {
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
  }
  return ignoreRules;
};
