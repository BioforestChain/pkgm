import type { Widgets } from "@bfchain/pkgm-base/lib/blessed";
import { afm } from "./animtion";
import { FRAMES } from "./const";

export class StatusBar {
  private _el!: Widgets.BoxElement;
  private _currentMsg = "";
  private _loadingFrameId = 0;
  private _loadingEnabled = false;
  constructor(el: Widgets.BoxElement) {
    this._el = el;
  }
  private _buildContent() {
    let c = "";
    if (this._loadingEnabled) {
      c += " " + FRAMES[this._loadingFrameId % FRAMES.length];
    }
    c += " " + this._currentMsg;
    return c;
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
    this._render();
  }

  private _ani_sid?: number;
  private _render() {
    if (this._loadingEnabled) {
      this._loadingFrameId++;
      if (this._ani_sid === undefined) {
        this._ani_sid = afm.requestAnimationFrame(() => {
          debugger;
          this._ani_sid = undefined;
          this._render();
        });
      }
    } else {
      this._loadingFrameId = 0;
      if (this._ani_sid) {
        afm.cancelAnimationFrame(this._ani_sid);
        this._ani_sid = undefined;
      }
    }
    this._el.content = this._buildContent();
  }

  setMsg(msg: string, loading = false) {
    this._currentMsg = msg;
    if (loading) {
      this.enableLoading();
    } else {
      this.disableLoading();
    }
  }
}
