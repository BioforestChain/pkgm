declare namespace BFSP.TUI {
  interface Panel<N extends string = string, K extends number = number> {
    name: N;
    orderKey: K;
  }
  namespace Panel {
    interface AllMap {
      Tsc: import("../src/sdk/tui/internalPanels.mjs").TscPanel;
      Workspaces: import("../src/sdk/tui/internalPanels.mjs").WorkspacesPanel;
      Dev: import("../src/sdk/tui/internalPanels.mjs").DevPanel;
      Build: import("../src/sdk/tui/internalPanels.mjs").BuildPanel;
      Deps: import("../src/sdk/tui/internalPanels.mjs").DepsPanel;
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
