//@ts-check
const path = require("node:path");
const fs = require("node:fs");
const NM_DIR = path.join(__dirname, "../node_modules");
(async () => {
  const BFCHAIN_NM_DIR = path.join(NM_DIR, "@bfchain");
  for (const name of fs.readdirSync(BFCHAIN_NM_DIR)) {
    if (name.startsWith("pkgm")) {
      continue;
    }
    let groupd = false;
    const log = (...args) => {
      if (!groupd) {
        console.group("fixing", name);
        groupd = true;
      }

      console.log(...args);
    };
    if (name.startsWith("util")) {
      for (const filepath of walkDtsFiles(path.join(BFCHAIN_NM_DIR, name))) {
        const oldContent = fs.readFileSync(filepath, "utf-8");
        const replacer = (_, p) => {
          if (p.endsWith(".js")) {
            return _;
          }
          return _.replace(p, p + ".js");
        };
        const newContent = oldContent
          .replace(/from "\.([^\"]+)";/g, replacer)
          .replace(/import\("\.([^\"]+)"\)/g, replacer);
        if (newContent !== oldContent) {
          log("fixed", path.relative(process.cwd(), filepath));
          fs.writeFileSync(filepath, newContent);
        } else {
          //   console.log("skip", filepath);
        }
      }
    }
    if (groupd) {
      console.groupEnd();
    }
  }
})();
function* walkDtsFiles(dir) {
  for (const name of fs.readdirSync(dir)) {
    const subpath = path.join(dir, name);
    if (fs.statSync(subpath).isDirectory()) {
      yield* walkDtsFiles(subpath);
    } else if (subpath.endsWith(".d.ts")) {
      yield subpath;
    }
  }
}
