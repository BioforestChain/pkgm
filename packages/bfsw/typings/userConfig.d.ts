declare namespace Bfsw {
  interface WorkspaceUserConfig extends Bfsp.UserConfig {
    path: string;
  }
  interface Workspace {
    projects: WorkspaceUserConfig[];
  }
}
