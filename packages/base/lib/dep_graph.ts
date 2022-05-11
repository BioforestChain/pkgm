interface IOpts {
  circular: boolean;
}
interface IDependency {
  [key: string]: string[];
}
export class DepGraph {
  nodes: Set<string> = new Set(); // 存储包和依赖
  outgoingEdges: IDependency = {}; // Node -> [Dependency Node]
  incomingEdges: IDependency = {}; // Node -> [Dependant Node]
  circular: boolean;
  constructor(opts?: IOpts) {
    this.circular = !!opts && !!opts.circular; // 允许循环依赖 { circular: true }
  }
  size() {
    return this.nodes.size;
  }
  hasNode(node: string) {
    return this.nodes.has(node);
  }
  addNode(node: string) {
    if (!this.hasNode(node)) {
      this.nodes.add(node);
      this.outgoingEdges[node] = [];
      this.incomingEdges[node] = [];
    }
  }
  addDependency(from: string, to: string) {
    if (!this.hasNode(from)) {
      throw new Error("Node does not exist: " + from);
    }
    if (!this.hasNode(to)) {
      throw new Error("Node does not exist: " + to);
    }
    if (this.outgoingEdges[from].indexOf(to) === -1) {
      this.outgoingEdges[from].push(to);
    }
    if (this.incomingEdges[to].indexOf(from) === -1) {
      this.incomingEdges[to].push(from);
    }
    return true;
  }
  overallOrder(leavesOnly: boolean = false) {
    const result: string[] = [];
    if (this.size() === 0) {
      return result; // Empty graph
    } else {
      if (!this.circular) {
        // 寻找循环——我们从所有节点开始运行 DFS，以防万一是这个依赖图中的几个断开的子图。
        const CycleDFS = createDFS(this.outgoingEdges, false, [], this.circular);
        this.nodes.forEach((n) => {
          CycleDFS(n);
        });
      }

      const DFS = createDFS(this.outgoingEdges, leavesOnly, result, this.circular);
      // 找到所有潜在的起点（没有任何依赖的节点）
      // 从这些点开始运行 DFS
      this.nodes.forEach((n) => {
        if (this.incomingEdges[n].length === 0) DFS(n);
      });

      // 如果我们允许循环 - 我们需要针对任何剩余的运行 DFS
      // 没有出现在初始结果中的节点（因为它们是
      // 没有明确起点的子图)
      if (this.circular) {
        this.nodes.forEach((n) => {
          if (result.indexOf(n) === -1) DFS(n);
        });
      }
      return result;
    }
  }
  removeNode(node: string) {
    if (this.hasNode(node)) {
      this.nodes.delete(node);
      delete this.outgoingEdges[node];
      delete this.incomingEdges[node];
      [this.incomingEdges, this.outgoingEdges].forEach((edgeList) => {
        Object.keys(edgeList).forEach(function (key) {
          var idx = edgeList[key].indexOf(node);
          if (idx >= 0) {
            edgeList[key].splice(idx, 1);
          }
        }, this);
      });
    }
  }
}

function createDFS(edges: IDependency, leavesOnly: boolean, result: string[], circular: boolean) {
  const visited: { [key: string]: boolean } = {};
  return function (start: string) {
    if (visited[start]) {
      return;
    }
    const inCurrentPath: { [key: string]: boolean } = {};
    const currentPath = [];
    const todo: { node: string; processed: boolean }[] = []; // 模拟堆栈
    todo.push({ node: start, processed: false });
    while (todo.length > 0) {
      const current = todo[todo.length - 1]; // 拿到等待的节点
      const processed = current.processed;
      const node = current.node;
      if (!processed) {
        // 尚未访问边缘（访问阶段）
        if (visited[node]) {
          todo.pop();
          continue;
        } else if (inCurrentPath[node]) {
          //不是有向无环图
          if (circular) {
            todo.pop();
            //如果容忍循环，不要重新访问节点
            continue;
          }
          currentPath.push(node);
          throw new DepGraphCycleError(currentPath);
        }

        inCurrentPath[node] = true;
        currentPath.push(node);
        const nodeEdges = edges[node];
        // 以相反的顺序将边缘推到待办事项堆栈上，以与旧的 DFS 实现顺序兼容
        for (let i = nodeEdges.length - 1; i >= 0; i--) {
          todo.push({ node: nodeEdges[i], processed: false });
        }
        current.processed = true;
      } else {
        // 已访问边缘（堆栈展开阶段）
        todo.pop();
        currentPath.pop();
        inCurrentPath[node] = false;
        visited[node] = true;
        if (!leavesOnly || edges[node].length === 0) {
          result.push(node);
        }
      }
    }
  };
}

class DepGraphCycleError extends Error {
  constructor(cyclePath: string[]) {
    super();
    const message = "Dependency Cycle Found: " + cyclePath.join(" -> ");
    let instance = new Error(message);
    Object.setPrototypeOf(instance, Object.getPrototypeOf(this));
    if (Error.captureStackTrace) {
      Error.captureStackTrace(instance, DepGraphCycleError);
    }
    return instance;
  }
}
