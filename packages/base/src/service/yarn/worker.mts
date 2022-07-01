import { getYarnCli } from "../../lib/yarn.mjs";
import { parentPort } from "node:worker_threads";

export type $YarnListWorkerMessage = {
  cmd: "list";
  data: $YarnListWorkerMessage.List["input"];
};
export namespace $YarnListWorkerMessage {
  type IO<I, Y, O> = { input: I; yield: Y; output: O };
  export type List = IO<{ cwd: string }, void, any>;
}

const port = parentPort;
port?.on("message", async (msg: $YarnListWorkerMessage) => {
  if (msg.cmd === "list") {
    process.argv = ["node", "yarn.js", "list", "--json", "--cwd", msg.data.cwd];
    await getYarnCli().start();
    port.postMessage(msg);
  }
});
