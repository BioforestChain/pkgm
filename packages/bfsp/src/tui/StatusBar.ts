import type { Widgets } from "@bfchain/pkgm-base/lib/blessed";
import { afm } from "./animtion";
import { FRAMES } from "./const";

export class StatusBar {
  private _el!: Widgets.BoxElement;
  private _currentMsg = "";
  private _nextMsgTi?: NodeJS.Timeout;
  private _loadingFrameId = 0;
  private _loadingEnabled = false;
  private _msgQ = [] as string[];
  constructor(el: Widgets.BoxElement) {
    this._el = el;
    this._nextMsgTi = setInterval(() => {
      this._nextMsg();
    }, 1000);
  }
  private _buildContent() {
    let c = "";
    if (this._loadingEnabled) {
      c += FRAMES[this._loadingFrameId % FRAMES.length];
    }
    c += " ".repeat(2);
    c += this._currentMsg;
    return c;
  }
  private _nextMsg() {
    if (this._msgQ.length > 0) {
      const msg = this._msgQ.shift();
      if (msg) {
        this._currentMsg = msg;
      }
    }
  }
  enableLoading() {
    if (this._loadingEnabled) {
      return;
    }
    this._loadingEnabled = true;
    this._render();
  }
  disableLoading() {
    this._loadingEnabled = false;
  }
  private _render() {
    if (this._loadingEnabled) {
      this._loadingFrameId++;
      afm.requestAnimationFrame(() => this._render());
    } else {
      this._loadingFrameId = 0;
      afm.requestAnimationFrame(() => {});
    }
    this._el.content = this._buildContent();
  }
  sendMsg(msg: string) {
    this._msgQ.unshift(msg); // 或者直接显示？
  }
  postMsg(msg: string) {
    this._msgQ.push(msg);
  }
}
