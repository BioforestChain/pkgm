import path from "node:path";
import url from "node:url";
import { fixNodeModules } from "./script/fixNodeModules";
import { installWatchman } from "./script/installWatchman";

export * from "./script/fixNodeModules";
export * from "./script/installWatchman";

export default async () => {
  const __filename = url.fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  await fixNodeModules(__dirname);
  await installWatchman();
};
