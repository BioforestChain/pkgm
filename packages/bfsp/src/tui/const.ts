import type { Widgets } from "@bfchain/pkgm-base/lib/blessed";
import type { LogLevel } from "@bfchain/pkgm-base/lib/vite";

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

export const T_NAV = 0;
export const H_NAV = 1;
export const H_STATUSBAR = 3;
export const H_LOG = `100%-${H_NAV + H_STATUSBAR}`;
export const W_MAIN_N = process.env["PKGM_MODE"] === "bfsw" ? 70 : 100;
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
export const TuiStyle = {
  nav: {
    top: T_NAV,
    height: H_NAV,
    width: W_MAIN,
  } as Widgets.BoxOptions,
  logPanel: {
    ...getBaseWidgetOptions(),
    top: T_NAV + H_NAV,
    width: W_MAIN,
    height: H_LOG,
    keys: true,
    vi: true,
    mouse: true,
    scrollable: true,
    draggable: true,
    alwaysScroll: true,
    scrollbar: {
      ch: " ",
      track: {
        inverse: true,
      },
      style: {
        inverse: true,
        fg: "cyan",
      },
    },
  } as Widgets.BoxOptions,
  statusBar: {
    ...getBaseWidgetOptions(),
    top: `100%-${H_STATUSBAR}`,
    height: H_STATUSBAR,
    width: W_MAIN,
  } as Widgets.BoxOptions,
};
