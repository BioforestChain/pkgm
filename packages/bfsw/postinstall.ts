import { fixNodeModules } from "@bfchain/pkgm-bfsp/postinstall";
import path from "node:path";
import url from "node:url";
export default async () => {
  const __filename = url.fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  await fixNodeModules(__dirname);
};
