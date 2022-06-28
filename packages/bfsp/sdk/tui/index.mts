import "./@type";
import { Tui } from "./Tui.mjs";
export * from "./Panel.mjs";

// export const tui = new Tui();
let tui: Tui | undefined;
export const getTui = () => {
  return (tui ??= new Tui());
};

export const hasTui = () => tui !== undefined;
