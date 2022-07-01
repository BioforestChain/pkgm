import { parentPort } from "node:worker_threads";
import { getYarnCli } from "../../lib/yarn.mjs";

export type $YarnListWorkerMessage = {
  cmd: "list-prod";
  data: $YarnListWorkerMessage.List["input"];
};
export namespace $YarnListWorkerMessage {
  type IO<I, Y, O> = { input: I; yield: Y; output: O };
  export type List = IO<{ cwd: string }, void, any>;
}

const port = parentPort;
if (port) {
  (async () => {
    port.on("message", async (msg: $YarnListWorkerMessage) => {
      if (msg.cmd === "list-prod") {
        await cli.run(["list", "--json", "--prod", "--cwd", msg.data.cwd]);
        port.postMessage({ type: "done" });
      }
    });
    const cli = await getYarnCli(
      (chunk) => {
        port.postMessage({ type: "data", data: chunk });
      },
      (e) => {
        port.postMessage({ type: "error", data: e });
      }
    );
    port.postMessage({ type: "ready" });
  })();
}
