import { fixNodeModules } from "./script/fixNodeModules";
export default async () => {
  await fixNodeModules();
};
