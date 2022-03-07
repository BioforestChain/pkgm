const postinstallFilepath = new URL("./dist/script/postinstall.mjs", import.meta.url);
(async () => {
  let postinstall;
  try {
    postinstall = await import(postinstallFilepath);
  } catch (err) {
    console.error("no found postinstall script, please run 'dev:script'.\n", err);
    return;
  }
  try {
    await postinstall.default();
  } catch (err) {
    console.error("postinstall fail:\n", err);
  }
})();
