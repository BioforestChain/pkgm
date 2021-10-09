import { getBfspUserConfig, BfspUserConfig } from "./userConfig";

export interface BfspProjectConfig {
  projectDirpath: string;
  userConfig: BfspUserConfig;
}
export const getBfspProjectConfig = async (dirname = process.cwd()) => {
  const userConfig = await getBfspUserConfig(dirname);
  if (userConfig === undefined) {
    return;
  }
  const projectConfig: BfspProjectConfig = {
    projectDirpath: dirname,
    userConfig,
  };
  return projectConfig;
};
