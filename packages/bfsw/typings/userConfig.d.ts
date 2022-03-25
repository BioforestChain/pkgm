declare namespace Bfsw {
  interface WorkspaceUserConfig extends Bfsp.UserConfig {
    relativePath: string;
  }
  interface Workspace {
    projects: WorkspaceUserConfig[];
  }
}
