import "./@type";
import { Tui } from "./Tui";
export * from "./Panel";

// export const tui = new Tui();
let tui: Tui | undefined;
export const getTui = () => {debugger
  return (tui ??= new Tui());
};

export const hasTui = () => tui !== undefined;
