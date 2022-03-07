import { fixNodeModules } from "./script/fixNodeModules";
import { installWatchman } from "./script/installWatchman";

export * from "./script/fixNodeModules";
export * from "./script/installWatchman";

export default async () => {
  await fixNodeModules();
  await installWatchman();
};
