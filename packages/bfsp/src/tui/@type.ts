declare namespace BFSP.TUI {
  interface Panel<N extends string = string, K extends number = number> {
    name: N;
    orderKey: K;
  }
  namespace Panel {
    interface AllMap {
      Tsc: import("./internalPanels").TscPanel;
      Workspaces: import("./internalPanels").WorkspacesPanel;
      Dev: import("./internalPanels").DevPanel;
      Build: import("./internalPanels").BuildPanel;
      Deps: import("./internalPanels").DepsPanel;
    }
    type Any = AllMap[keyof AllMap];
    type Name<P extends Panel = Any> = P["name"];
    type GetByName<N extends string, P extends Panel = Any> = P extends Panel<infer Name>
      ? N extends Name
        ? P
        : never
      : never;
  }
}
