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
  keys: true,
  keyable: true,
  mouse: true,
  scrollable: true,
  draggable: false,
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
const W_R_SIDE = 30;

export const TuiStyle = {
  //#region layout 1

  leftSide: {
    top: T_SAFE_AREA,
    width: `100%`,
    height: `100%-${T_SAFE_AREA}`,
    left: 0,
  } as Widgets.BoxOptions,
  rightSide: {
    top: T_SAFE_AREA,
    width: 0,
    height: `100%-${T_SAFE_AREA}`,
    right: 0,
  } as Widgets.BoxOptions,

  leftSide1: {
    width: `${100 - W_R_SIDE}%`,
  } as Widgets.BoxOptions,
  rightSide1: {
    width: `${W_R_SIDE}%`,
  } as Widgets.BoxOptions,
  //#endregion

  //#region layout 2

  leftMain: {
    top: T_SAFE_AREA,
    width: `100%`,
    height: `100%-${H_STATUSBAR}`,
    left: 0,
  } as Widgets.BoxOptions,
  leftBottomBar: {
    ...BASE_STYLE,
    top: `100%-${H_STATUSBAR}`,
    height: H_STATUSBAR,
    width: `100%`,
  } as Widgets.BoxOptions,
  //#endregion

  //#region layout 3

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
  //#endregion
};
