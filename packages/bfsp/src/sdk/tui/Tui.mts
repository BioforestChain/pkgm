import { blessed, Widgets } from "@bfchain/pkgm-base/lib/blessed.mjs";
import { chalk, supportsColor } from "@bfchain/pkgm-base/lib/chalk.mjs";
import { jsonClone } from "../toolkit/toolkit.util.mjs";
import { afm } from "./animtion.mjs";
import { TuiStyle } from "./const.mjs";
import {
  BuildPanel,
  CenterMainPanelGroup,
  DepsPanel,
  DevPanel,
  RightSidePanelGroup,
  TscPanel,
  WorkspacesPanel,
} from "./internalPanels.mjs";
import { StatusBar } from "./StatusBar.mjs";

export class Tui {
  private _focusedKeyShort: string = "";
  private _screen = blessed.screen({
    smartCSR: true,
    useBCE: true,
    debug: true,
    sendFocus: true,
    terminal: supportsColor && supportsColor.has256 ? "xterm-256color" : "xterm",
    fullUnicode: true,
    title: process.env["PKGM_MODE"] + " - powered by @bfchain/pkgm",
  });
  private _mainPanels = new CenterMainPanelGroup();
  private _leftSideView = blessed.box({ ...jsonClone(TuiStyle.leftSide) });
  private _rsidePanels = new RightSidePanelGroup();
  private _allPanelOrderedList: BFSP.TUI.Panel.Any[] = [];
  readonly status = new StatusBar();
  // readonly nav: Widgets.BoxElement;
  constructor() {
    const screen = this._screen;

    /// 初始化布局
    {
      const { _leftSideView } = this;

      screen.append(this._rsidePanels.view);
      screen.append(_leftSideView);

      _leftSideView.append(this._mainPanels.view);
      _leftSideView.append(this.status.view);

      screen.render();
    }

    /// 初始化按键绑定
    {
      /// 快捷键导航
      screen.on("keypress", (ch, key) => {
        // if (key.meta) {
        for (const panel of this._allPanelOrderedList) {
          if (panel.keyShort === ch) {
            this._updateFocus(panel);
            break;
            // }
          }
        }
      });
      /// 左右导航
      screen.key(["left", "right"], (ch, key) => {
        const allPanels = this._allPanelOrderedList;
        const oldIndex = allPanels.findIndex((p) => p.keyShort === this._focusedKeyShort);
        const inc = key.name === "left" ? -1 : 1;
        const newIndex = (oldIndex + inc + allPanels.length) % allPanels.length;

        const selectedPanel = allPanels[newIndex]!;
        this._focusedKeyShort = selectedPanel.keyShort;
        this._updateFocus(selectedPanel);
      });
    }

    /// 绑定动画帧的回调
    afm.bindRender(() => this._screen.render());

    /// 关闭进程的交互
    queueMicrotask(() => {
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
    let panel: BFSP.TUI.Panel.Any | undefined;
    if (this._mainPanels.belong(name)) {
      panel = this._mainPanels.get(name);
    } else if (this._rsidePanels.belong(name)) {
      panel = this._rsidePanels.get(name);

      /**
       * 触发动态布局
       * @TODO 改进触发机制
       */
      Object.assign(this._rsidePanels.view, TuiStyle.rightSide1);
      Object.assign(this._leftSideView, TuiStyle.leftSide1);
    }

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

      // 尝试保存到某一个集合中，直到成功为止
      this._mainPanels.trySet(panel) ||
        //
        this._rsidePanels.trySet(panel);

      /**导出所有的面板，并为其进行排序 */
      const allPanels = [...this._mainPanels.values(), ...this._rsidePanels.values()];
      const allPanelOrderedMap = new Map(
        [...this._mainPanels.panelKeyOrder, ...this._rsidePanels.panelKeyOrder].map((name, index) => [name, index])
      );
      allPanels.sort((a, b) => allPanelOrderedMap.get(a.name)! - allPanelOrderedMap.get(b.name)!);
      this._allPanelOrderedList = allPanels;

      /// 强制聚焦第一个面板
      const firstPanel = allPanels[0];
      this._updateFocus(firstPanel);
    }
    return panel;
  }

  /**
   * 更新聚焦的面板
   */
  private _updateFocus(selectedPanel?: BFSP.TUI.Panel.Any) {
    if (selectedPanel === undefined) {
      for (const panel of this._allPanelOrderedList) {
        if (panel.keyShort === this._focusedKeyShort) {
          selectedPanel = panel;
          break;
        }
      }
    }
    if (selectedPanel !== undefined) {
      this._focusedKeyShort = selectedPanel.keyShort;
      selectedPanel.activate();
    }
    this._screen.render();
  }

  destory() {
    this._screen.destroy();
  }
  private _i = 0;
  debug(...args: unknown[]) {
    this._screen.debug(this._i++ + ":", ...(args as any));
  }
}
