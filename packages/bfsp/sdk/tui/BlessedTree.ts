import blessed from "blessed";
const Box = blessed.box;

export class BlessedTree {
  nodeLines: any;
  rows!: blessed.Widgets.ListElement;
  lineNbr!: number;
  options!:blessed.Widgets.BoxOptions;
  data;
  screen: any;
  width!: number;
  height!: number;
  constructor(options: blessed.Widgets.BoxOptions) {
    if (!(this instanceof Node)) {
      return new BlessedTree(options);
    }
    this.options = options || {};
    this.options = options;
    this.data = {};
    this.nodeLines = [];
    this.lineNbr = 0;
    Box.call(this, options);
    options.extended = options.extended || false;
    options.keys = options.keys || ["+", "space", "enter"];

    options.template = options.template || {};
    options.template.extend = options.template.extend || " [+]";
    options.template.retract = options.template.retract || " [-]";
    options.template.lines = options.template.lines || false;

    // Do not set height, since this create a bug where the first line is not always displayed
    this.rows = blessed.list({
      top: 1,
      width: 0,
      left: 1,
      style: options.style,
      padding: options.padding,
      keys: true,
      tags: options.tags,
      input: options.input,
      vi: options.vi,
      ignoreKeys: options.ignoreKeys,
      scrollable: options.scrollable,
      mouse: options.mouse,
      selectedBg: options.selectedBg || "blue",
      selectedFg: options.selectedFg || "black",
    });
  }

  walk(node: any, treeDepth: string | any[]):any {
    let lines = [];

    if (!node.parent) {
      // root level
      this.lineNbr = 0;
      this.nodeLines.length = 0;
      node.parent = null;
    }

    if (treeDepth === "" && node.name) {
      this.lineNbr = 0;
      this.nodeLines[this.lineNbr++] = node;
      lines.push(node.name);
      treeDepth = " ";
    }

    node.depth = treeDepth.length - 1;

    if (node.children && node.extended) {
      let i = 0;

      if (typeof node.children === "function") node.childrenContent = node.children(node);

      if (!node.childrenContent) node.childrenContent = node.children;

      for (let child in node.childrenContent) {
        if (!node.childrenContent[child].name) node.childrenContent[child].name = child;

        const _child = node.childrenContent[child];
        _child.parent = node;
        _child.position = i++;

        if (typeof _child.extended === "undefined") _child.extended = this.options.extended;

        if (typeof _child.children === "function") _child.childrenContent = _child.children(child);
        else _child.childrenContent = _child.children;

        let isLastChild = _child.position === Object.keys(_child.parent.childrenContent).length - 1;
        let treePrefix;
        let suffix = "";
        if (isLastChild) treePrefix = "└";
        else treePrefix = "├";

        if (!_child.childrenContent || Object.keys(_child.childrenContent).length === 0) {
          treePrefix += "─";
        } else if (_child.extended) {
          treePrefix += "┬";
          suffix = this.options.template.retract;
        } else {
          treePrefix += "─";
          suffix = this.options.template.extend;
        }

        if (!this.options.template.lines) treePrefix = "|-";
        if (this.options.template.spaces) treePrefix = " ";

        lines.push(treeDepth + treePrefix + _child.name + suffix);

        this.nodeLines[this.lineNbr++] = child;

        let parentTree;
        if (isLastChild || !this.options.template.lines) parentTree = treeDepth + " ";
        else parentTree = treeDepth + "│";

        lines = lines.concat(this.walk(child, parentTree));
      }
    }
    return lines;
  }

  focus() {
    this.rows.focus();
  }

  render() {
    if (this.screen.focused === this.rows) this.rows.focus();

    this.rows.width = (this.width as number) - 3;
    this.rows.height = (this.height as number) - 3;
    return Box.prototype.render.call(this);
  }

  setData(nodes: any) {
    this.data = nodes;
    this.rows.setItems(this.walk(nodes, ""));
  }

  type = "tree";
}
