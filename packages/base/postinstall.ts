import { installWatchman } from "./script/installWatchman";

export * from "./script/installWatchman";

export default async () => {
  await installWatchman();
};
