declare namespace Bfsp {
  type IgnoreUserConfig =
    | {
        include?: string[];
        exclude?: string[];
      }
    | string[];
  interface UserConfig {
    gitignore?: IgnoreUserConfig;
  }
}
