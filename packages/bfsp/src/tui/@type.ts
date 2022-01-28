declare namespace BFSP.TUI {
  interface Panel<N extends string = string, K extends number = number> {
    name: N;
    key: K;
  }
  namespace Panel {
    interface AllMap {
      Tsc: import("./internalPanels").TscPanel;
      Bundle: import("./internalPanels").BundlePanel;
      Deps: import("./internalPanels").DepsPanel;
    }
    type All = AllMap[keyof AllMap];
    type Name<P extends Panel = All> = P["name"];
    type GetByName<N extends string, P extends Panel = All> = P extends Panel<infer Name>
      ? N extends Name
        ? P
        : never
      : never;
  }
}
