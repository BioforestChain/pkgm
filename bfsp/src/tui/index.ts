import blessed, { Widgets } from "blessed";
import chalk, { supportsColor } from "chalk";
import crypto from "node:crypto";
import "./@type";
import { afm } from "./animtion";
import { getBaseWidgetOptions, H_NAV, H_STATUSBAR, W_MAIN, W_MAIN_N } from "./const";
import { BundlePanel, DepsPanel, TscPanel } from "./internalPanels";
import { StatusChangeCallback } from "./Panel";
import { StatusBar } from "./StatusBar";
export { PanelStatus } from "./Panel";

const TuiStyle = {
  nav: {
    height: H_NAV,
    width: W_MAIN,
  } as Widgets.BoxOptions,
  statusBar: {
    ...getBaseWidgetOptions(),
    top: `100%-${H_STATUSBAR}`,
    height: H_STATUSBAR,
    width: W_MAIN,
  } as Widgets.BoxOptions,
};

class Tui {
  private _currentKey: number = -1;
  private _panels = new Map<BFSP.TUI.Panel.Name, BFSP.TUI.Panel.All>();
  private _screen!: Widgets.Screen;
  status!: StatusBar;
  constructor() {
    this._screen = blessed.screen({
      smartCSR: true,
      useBCE: true,
      debug: true,
      sendFocus: true,
      terminal: supportsColor && supportsColor.has256 ? "xterm-256color" : "xterm",
      fullUnicode: true,
      title: "bfsp - powered by @bfchain/pkgm",
    });
    this._initControls();
    this._screen.render();

    // setTimeout(() => {
    //   const p = this.getPanel("Tsc")!;
    //   p.clear();
    // }, 1000);
    const screen = this._screen;
    queueMicrotask(() => {
      //// 关闭进程的交互

      let asking = false;
      let dangerQuestion: Widgets.QuestionElement | undefined;
      function initDangerQuestion() {
        const dangerQuestion = blessed.question({
          parent: screen,
          border: "line",
          height: "shrink",
          width: "half",
          top: "center",
          left: "center",
          label: " {red-fg}WARNING{/red-fg} ",
          style: { border: { fg: "yellow" } },
          tags: true,
          keys: true,
          vi: true,
        });
        dangerQuestion._.okay.content = `${chalk.underline("Y")}es`;
        dangerQuestion._.cancel.content = `${chalk.underline("N")}o`;
        return dangerQuestion;
      }

      screen!.key([/* "escape", "q",  */ "C-c"], function (ch, key) {
        dangerQuestion ??= initDangerQuestion();

        if (asking) {
          return process.exit(0);
        }
        asking = true;
        dangerQuestion.ask("confirm to exit?", (err, confirmed) => {
          asking = false;
          if (confirmed) {
            return process.exit(0);
          }
        });
      });
    });
  }

  getPanel<N extends BFSP.TUI.Panel.Name>(name: N) {
    return this._panels.get(name) as BFSP.TUI.Panel.GetByName<N>;
  }
  destory() {
    this._screen.destroy();
  }
  debug(...args: unknown[]) {
    this._screen.debug(...(args as any));
  }
  private _initControls() {
    const tsc = new TscPanel(this, 1, "Tsc");
    this._panels.set(tsc.name, tsc);

    const bundle = new BundlePanel(this, 2, "Bundle");
    this._panels.set(bundle.name, bundle);

    const deps = new DepsPanel(this, 3, "Deps");
    this._panels.set(deps.name, deps);

    const sorted = [...this._panels.values()];
    sorted.sort((a, b) => a.key - b.key); // 这样导航项就是升序

    const nav = blessed.box(TuiStyle.nav);

    this._screen.append(nav);
    const unitWidth = Math.round(W_MAIN_N / sorted.length);
    sorted.forEach((p, i) => {
      // 菜单项样式
      p.elMenu.width = `${unitWidth}%`;
      p.elMenu.left = i * unitWidth;
      nav.append(p.elMenu);
      this._screen.append(p.elLog);
      // 按键导航
      this._screen.key(`${p.key}`, (ch, key) => {
        if (p.key === this._currentKey) {
          return;
        }
        this._currentKey = p.key;
        this._updateSelected();
      });
    });
    // 左右导航
    this._screen.key(["left", "right"], (ch, key) => {
      let index = sorted.findIndex((p) => p.key === this._currentKey);
      if (key.name === "left") {
        index--;
        if (index < 0) {
          index += sorted.length;
        }
      } else if (key.name === "right") {
        index++;
        if (index >= sorted.length) {
          index -= sorted.length;
        }
      }
      this._currentKey = sorted[index]!.key;
      this._updateSelected();
    });
    this._currentKey = sorted[0].key;
    this._updateSelected();

    /// 绑定导航栏
    const statusBar = blessed.box(TuiStyle.statusBar);
    this._screen.append(statusBar);
    const status = (this.status = new StatusBar(statusBar));

    const loadingCount = new Set<string>();
    const onStatusChange: StatusChangeCallback = (state, ctx) => {
      if (state === "loading") {
        loadingCount.add(ctx.name);
      } else {
        loadingCount.delete(ctx.name);
      }
      if (loadingCount.size > 0) {
        status.enableLoading();
      } else {
        status.disableLoading();
      }
    };
    for (const panel of sorted) {
      panel.onStatusChange = onStatusChange;
    }

    /// 绑定动画帧的回调
    afm.onAnimationFrame = () => this._screen.render();
  }

  private _updateSelected() {
    this._panels.forEach((x) => {
      x.deactivate();
      if (x.key === this._currentKey) {
        x.activate();
      }
    });
    this._screen.render();
  }
}
// export const tui = new Tui();
let tui: Tui | undefined;
export const getTui = () => {
  return (tui ??= new Tui());
};

/**
 * 以下代码用于测试面板是否能正常输出
 * 实际运行中，面板经常性闪烁/显示不完整。
 * 但只跑这段代码输出时是正常的，因此怀疑可能是vite输出了清屏的ansi指令
 */
export const testTui = () => {
  const tui = getTui();
  const tsc = tui.getPanel("Tsc");
  const vite = tui.getPanel("Bundle");
  vite.write("info", "vite v2.7.1 start building");
  const randMsg = () => {
    const errCount = Math.round(Math.random() * 10) % 2;
    const tsmsg = `Found ${errCount} errors`;
    if (Math.random() > 0.5) {
      if (Math.random() > 0.5) {
        tsc.write(tsmsg);
      } else {
        tsc.write(crypto.randomBytes(6).toString("base64"));
      }
    } else {
      vite.write("info", crypto.randomBytes(6).toString("base64"));
    }
    setTimeout(() => {
      randMsg();
    }, 800);
  };
  randMsg();
  return;
};
