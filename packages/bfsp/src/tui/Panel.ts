import { blessed } from "@bfchain/pkgm-base/lib/blessed";
import { chalk } from "@bfchain/pkgm-base/lib/chalk";
import { createSuperLogger } from "../SuperLogger";
import { jsonClone } from "../toolkit.util";
import { afm } from "./animtion";
import { FRAMES, TuiStyle } from "./const";

export interface PanelContext {
  debug(log: string): void;
}
export abstract class Panel<N extends string, K extends number = number> implements BFSP.TUI.Panel<N, K> {
  constructor(
    protected _ctx: PanelContext,
    /**数字快捷键 */
    public orderKey: K,
    readonly name: N
  ) {
    this.updateStatus(this._status);

    /// 如果聚焦元素改变，那么需要重新渲染样式
    this.elLog.on("blur", () => {
      this._isActive = false;
      this._ctx.debug("blur " + this.name);
      this.$queueRenderTab();
    });
  }
  private _status: PanelStatus = "info"; // "loading";
  get status() {
    return this._status;
  }
  private _loadingFrameId = 0;
  private _isActive = true;
  readonly elLog = blessed.log(this.$elLogStyle);
  protected get $elLogStyle() {
    return jsonClone(TuiStyle.logWithBorder);
  }
  readonly elTab = blessed.box(this.$elTabStyle);
  protected get $elTabStyle() {
    return {};
  }

  onStatusChange?: StatusChangeCallback;
  updateStatus(s: PanelStatus) {
    if (s === this._status) {
      return;
    }
    this._status = s;
    this.onStatusChange?.(s, this);
    this.$queueRenderTab();
  }

  private _renderingTab = false;
  protected $queueRenderTab() {
    if (this._renderingTab) {
      return;
    }
    this._renderingTab = true;
    queueMicrotask(() => {
      /// update loading
      {
        if (this._status === "loading") {
          this._loadingFrameId++;
          if (this._ani_pid === undefined) {
            this._ani_pid = afm.requestAnimationFrame(() => {
              this._ani_pid = undefined;
              this.$queueRenderTab();
            });
          }
        } else {
          this._loadingFrameId = 0;
          if (this._ani_pid !== undefined) {
            afm.cancelAnimationFrame(this._ani_pid);
            this._ani_pid = undefined;
          }
        }
      }
      /// build tab content
      {
        let c = "";
        // state
        if (this._status === "loading") {
          c += FRAMES[this._loadingFrameId % FRAMES.length];
        } else if (this._status === "warn") {
          c += chalk.yellow.bold("!");
        } else if (this._status === "success") {
          c += chalk.green.bold("✓");
        } else if (this._status === "error") {
          c += chalk.red.bold("x");
        }

        c += " ";
        // content
        if (this._isActive) {
          c += chalk.bgWhiteBright(
            chalk.bold(chalk.cyan.underline(`[${this.keyShort}]`) + " " + chalk.black(this.name))
          );
        } else {
          c += chalk.cyan.underline(`[${this.keyShort}]`) + " " + this.name;
        }
        if (c !== this.elTab.content) {
          this.elTab.content = c;
        }
      }

      this._renderingTab = false;
    });
  }
  private _ani_pid?: number;

  get keyShort() {
    return this.orderKey.toString();
  }
  clear() {
    this.elLog.setContent("");
  }
  group?: PanelGroup;
  activate() {
    if (this.group) {
      for (const panel of this.group.values()) {
        if (panel.name !== this.name) {
          panel.deactivate();
        }
      }
    }
    this.elLog.show();
    this.elLog.focus();
    this._isActive = true;
    this._ctx.debug("show " + this.name);
    this.$queueRenderTab();
  }
  deactivate() {
    this.elLog.hide();
    this._isActive = false;
    this._ctx.debug("hide " + this.name);
    this.$queueRenderTab();
  }

  //#region 日志输出
  /**
   * 日志输出提供了极高的可拓展性
   * 1. 这里默认提供了一个强大的默认输出面板（logger），开发者可以自己修改这个面板的输出行为
   *    1. 可以自定义 write
   *    1. 可以自定义 clearLine
   *    1. 可以自定义 clearScreen
   *    1. 可以自定义 logger 的生成
   * 1. 但也可以扩展自己的输出面板，最终再将两个面板混合起来输出
   *    1. 重写 $renderLog 来定义最终的输出内容
   *    1. 使用 $queueRenderLog 来调度输出指令
   */

  protected $logAllContent = "";
  protected $logLastContent = "";
  write(s: string) {
    this.$logAllContent += this.$logLastContent = s;
    this.$queueRenderLog();
  }
  clearLine() {
    if (this.$logLastContent.length === 0) {
      return;
    }
    this.$logAllContent = this.$logAllContent.slice(0, -this.$logLastContent.length);
    this.$logLastContent = "";
    this.$logAllContent;
  }
  clearScreen() {
    this.$logLastContent = "";
    this.$logAllContent = "";
    this.$queueRenderLog();
  }

  private _renderingLog = false;
  protected $queueRenderLog() {
    if (this._renderingLog) {
      return;
    }
    this._renderingLog = true;
    queueMicrotask(() => {
      this._renderingLog = false;
      this.$renderLog();
    });
  }
  protected $renderLog() {
    this.elLog.setContent(this.$logAllContent);
  }

  private $getLoggerWriter() {
    return this.write.bind(this);
  }
  private $getLoggerClearScreen() {
    return this.clearScreen.bind(this);
  }
  private $getLoggerClearLine() {
    return this.clearLine.bind(this);
  }
  private _logger?: PKGM.Logger;
  get logger() {
    if (this._logger === undefined) {
      const writer = this.$getLoggerWriter();
      this._logger = createSuperLogger({
        prefix: "",
        infoPrefix: "i",
        warnPrefix: "⚠",
        errorPrefix: "X",
        successPrefix: "✓",
        stdoutWriter: writer,
        stderrWriter: writer,
        clearScreen: this.$getLoggerClearScreen(),
        clearLine: this.$getLoggerClearLine(),
      });
    }
    return this._logger;
  }
  //#endregion
}
export type StatusChangeCallback = (s: PanelStatus, ctx: BFSP.TUI.Panel) => void;
export type PanelStatus = "success" | "error" | "warn" | "loading" | "info";

export class PanelGroup<N extends BFSP.TUI.Panel.Name = BFSP.TUI.Panel.Name> {
  readonly view = blessed.box(this.$viewStyle);
  protected get $viewStyle() {
    return {};
  }
  readonly navBar = blessed.box({
    ...jsonClone(TuiStyle.navBar),
    parent: this.view,
  });
  readonly container = blessed.box({
    ...jsonClone(TuiStyle.container),
    parent: this.view,
  });

  // readonly container = blessed.
  constructor(names: Iterable<N>) {
    for (const name of names) {
      this.names.add(name);
    }
  }
  private names = new Set<BFSP.TUI.Panel.Name>();
  belong(name: BFSP.TUI.Panel.Name): name is N {
    return this.names.has(name);
  }
  private items = new Map<N, BFSP.TUI.Panel.GetByName<N>>();

  trySet(panel: BFSP.TUI.Panel.Any) {
    if (this.belong(panel.name)) {
      if (this.items.has(panel.name) === false) {
        this.set(panel.name, panel as any);
        return true;
      }
    }
    return false;
  }
  set<NAME extends N>(name: NAME, panel: BFSP.TUI.Panel.GetByName<NAME>) {
    this.items.set(name, panel);
    panel.group = this;
    this.navBar.append(panel.elTab);
    this.container.append(panel.elLog);

    const allPanels = [...this.values()];

    /// 更新顺序与索引
    allPanels.forEach((panel) => (panel.orderKey = this.panelKeyOrder.indexOf(panel.name)));
    allPanels.sort((a, b) => a.orderKey - b.orderKey); // 升序
    allPanels.forEach((panel, index) => (panel.orderKey = index + 1));

    /// 更新计算布局
    const unitWidth = Math.round(100 / allPanels.length);
    for (const [index, panel] of allPanels.entries()) {
      panel.elTab.width = `${unitWidth}%`;
      panel.elTab.left = `${index * unitWidth}%`;
    }
    // 激活渲染
    panel.activate();
  }
  readonly panelKeyOrder: readonly BFSP.TUI.Panel.Name[] = [];
  get<NAME extends N>(name: NAME) {
    return this.items.get(name) as BFSP.TUI.Panel.GetByName<NAME> | undefined;
  }
  has<NAME extends N>(name: NAME) {
    return this.items.has(name);
  }
  keys() {
    return this.items.keys();
  }
  values() {
    return this.items.values();
  }
  entries() {
    return this.items.entries();
  }
}
