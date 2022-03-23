import type { Widgets } from "@bfchain/pkgm-base/lib/blessed";
import type { LogLevel } from "@bfchain/pkgm-base/lib/vite";

export const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export const LogLevels: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
};

const BASE_STYLE: Widgets.BoxOptions = {
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
} as Widgets.BoxOptions;
const SCROLLABLE_STYLE: Widgets.BoxOptions = {
  keyable: true,
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
};
const T_SAFE_AREA = 0;
const H_NAV = 1;
const H_STATUSBAR = 3;
const W_SIDE_N = 30;
const W_MAIN_N = process.env["PKGM_MODE"] === "bfsw" ? 100 - W_SIDE_N : 100;
const W_MAIN = `${W_MAIN_N}%`;
export const TuiStyle = {
  leftMain: {
    top: T_SAFE_AREA,
    width: W_MAIN,
    height: `100%-${H_STATUSBAR}`,
    left: 0,
  } as Widgets.BoxOptions,
  leftBottomBar: {
    ...BASE_STYLE,
    top: `100%-${H_STATUSBAR}`,
    height: H_STATUSBAR,
    width: W_MAIN,
  } as Widgets.BoxOptions,
  rightSide: {
    top: T_SAFE_AREA,
    width: `${W_SIDE_N}%`,
    height: "100%",
    right: 0,
  } as Widgets.BoxOptions,

  navBar: {
    top: 0,
    height: H_NAV,
    width: "100%",
  } as Widgets.BoxOptions,
  container: {
    top: H_NAV,
    height: `100%-${H_NAV}`,
    width: "100%",
  },
  logNoBorder: {
    top: 0,
    width: "100%",
    height: "100%",
    ...SCROLLABLE_STYLE,
  },
  logWithBorder: {
    ...BASE_STYLE,
    top: 0,
    width: "100%",
    height: "100%",
    ...SCROLLABLE_STYLE,
  } as Widgets.BoxOptions,
};
