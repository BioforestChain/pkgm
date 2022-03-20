import { blessed, Widgets } from "@bfchain/pkgm-base/lib/blessed";
import { chalk, supportsColor } from "@bfchain/pkgm-base/lib/chalk";
import { EasyMap } from "@bfchain/pkgm-base/util/extends_map";
import { afm } from "./animtion";
import { TuiStyle, W_MAIN_N } from "./const";
import { BuildPanel, DepsPanel, DevPanel, TscPanel, WorkspacesPanel } from "./internalPanels";
import { StatusBar } from "./StatusBar";

export class Tui {
  private _focusedKey: number = -1;
  private _panels = new Map<BFSP.TUI.Panel.Name, BFSP.TUI.Panel.Any>();
  private _screen!: Widgets.Screen;
  status!: StatusBar;
  readonly nav: Widgets.BoxElement;
  constructor() {
    const screen = (this._screen = blessed.screen({
      smartCSR: true,
      useBCE: true,
      debug: true,
      sendFocus: true,
      terminal: supportsColor && supportsColor.has256 ? "xterm-256color" : "xterm",
      fullUnicode: true,
      title: process.env["PKGM_MODE"] + " - powered by @bfchain/pkgm",
    }));
    {
      const nav = (this.nav = blessed.box(TuiStyle.nav));
      screen.append(nav);
      // 左右导航
      screen.key(["left", "right"], (ch, key) => {
        const allPanels = [...this._panels.values()];
        let index = allPanels.findIndex((p) => p.orderKey === this._focusedKey);
        if (key.name === "left") {
          index--;
          if (index < 0) {
            index += allPanels.length;
          }
        } else if (key.name === "right") {
          index++;
          if (index >= allPanels.length) {
            index -= allPanels.length;
          }
        }
        this._focusedKey = allPanels[index]!.orderKey;
        this._updateSelected();
      });
    }

    {
      const statusBar = blessed.box(TuiStyle.statusBar);
      screen.append(statusBar);
      const status = (this.status = new StatusBar(statusBar));
    }

    /// 绑定动画帧的回调
    afm.onAnimationFrame = () => this._screen.render();

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
    return this._forceGetPanel(name) as BFSP.TUI.Panel.GetByName<N>;
  }
  private _forceGetPanel<N extends BFSP.TUI.Panel.Name>(name: N) {
    let panel = this._panels.get(name);
    if (panel === undefined) {
      switch (name) {
        case "Tsc":
          panel = new TscPanel(this, -1, name);
          break;
        case "Dev":
          panel = new DevPanel(this, -1, name);
          break;
        case "Build":
          panel = new BuildPanel(this, -1, name);
          break;
        case "Deps":
          panel = new DepsPanel(this, -1, name);
          break;
        case "Workspaces":
          panel = new WorkspacesPanel(this, -1, name);
          break;
        default:
          throw new Error(`unknown panel name: ${name}`);
      }
      /// 开始重新计算布局
      const { nav, _screen: screen } = this;
      // 先移除所有的导航元素
      const allOldPanels = [...this._panels.values()];
      for (const panel of allOldPanels) {
        nav.remove(panel.elMenu);
        screen.remove(panel.elLog);
        screen.unkey(`${panel.orderKey}`, this._onKeyEventMap.forceGet(panel));
      }

      this._panels.set(name, panel);
      const allPanels = [...this._panels.values()];
      allPanels.forEach((panel) => (panel.orderKey = panelKeyOrder.indexOf(panel.name)));
      allPanels.sort((a, b) => a.orderKey - b.orderKey); // 升序
      allPanels.forEach((panel, index) => (panel.orderKey = index + 1));

      // 重新添加所有的导航元素
      const unitWidth = Math.round(W_MAIN_N / allPanels.length);
      for (const [index, panel] of allPanels.entries()) {
        panel.elMenu.width = `${unitWidth}%`;
        panel.elMenu.left = `${index * unitWidth}%`;
        nav.append(panel.elMenu);
        screen.append(panel.elLog);
        screen.key(`${panel.orderKey}`, this._onKeyEventMap.forceGet(panel));
      }

      /// 强制聚焦
      this._onKeyEventMap.forceGet(panel)();
    }
    return panel;
  }
  private _onKeyEventMap = EasyMap.from({
    creater: (panel: BFSP.TUI.Panel.Any) => {
      return () => {
        if (panel.orderKey === this._focusedKey) {
          return;
        }
        this._focusedKey = panel.orderKey;
        this._updateSelected();
      };
    },
  });

  destory() {
    this._screen.destroy();
  }
  debug(...args: unknown[]) {
    this._screen.debug(...(args as any));
  }
  private _updateSelected() {
    this._panels.forEach((x) => {
      x.deactivate();
      if (x.orderKey === this._focusedKey) {
        x.activate();
      }
    });
    this._screen.render();
  }
}
const panelKeyOrder: BFSP.TUI.Panel.Name[] = ["Build", "Tsc", "Dev", "Deps", "Workspaces"];
