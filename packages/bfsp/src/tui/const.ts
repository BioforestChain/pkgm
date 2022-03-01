import { Widgets } from "blessed";
import { LogLevel } from "vite";

export const getBaseWidgetOptions = () =>
  ({
    tags: true,
    border: {
      type: "line",
    },
    style: {
      border: {
        fg: "gray",
      },
      focus: {
        border: {
          fg: "cyan",
        },
      },
    },
  } as Widgets.BoxOptions);

export const H_NAV = 1;
export const H_STATUSBAR = 3;
export const H_LOG = `100%-${2 * H_NAV + H_STATUSBAR}`;
export const W_MAIN_N = 70;
export const W_INFO_N = 30;
export const W_MAIN = `${W_MAIN_N}%`;
export const W_INFO = `${W_INFO_N}%`;
export const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export const LogLevels: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
};
