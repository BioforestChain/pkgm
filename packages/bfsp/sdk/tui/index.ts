import "./@type";
import { Tui } from "./Tui";
export * from "./Panel";
export * from './BlessedTree';

// export const tui = new Tui();
let tui: Tui | undefined;
export const getTui = () => {
  return (tui ??= new Tui());
};

export const hasTui = () => tui !== undefined;
