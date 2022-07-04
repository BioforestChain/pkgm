import { $Typescript, getTypescript, transpileModule } from "@bfchain/pkgm-base/lib/typescript.mjs";
import type { InlineConfig } from "@bfchain/pkgm-base/lib/vite.mjs";
import { $YarnListRes } from "@bfchain/pkgm-base/service/yarn/runner.mjs";
import { getExternalOption } from "@bfchain/pkgm-base/vite-config-helper/index.mjs";
import fs from "node:fs";
import path from "node:path";
import { ALLOW_FORMATS, parseExtensionAndFormat } from "../../helper/js_format.mjs";
import { $TsConfig } from "../../main/configs/tsConfig.mjs";
import type { $ViteConfig } from "../../main/configs/viteConfig.mjs";
import { DevLogger } from "../../sdk/logger/logger.mjs";
const debug = DevLogger("bfsp:config/vite");

export const ViteConfigFactory = async (options: {
  userConfig: Bfsp.UserConfig;
  projectDirpath: string;
  viteConfig: $ViteConfig;
  tsConfig: $TsConfig;
  format?: Bfsp.Format;
  profiles?: string[];
  outDir?: string;
  outRoot?: string;
  outSubPath?: string;
  logger: PKGM.Logger;
  rootDepsInfo?: $YarnListRes;
}) => {
  const { userConfig, tsConfig, projectDirpath, viteConfig, rootDepsInfo } = options;
  const logger = options.logger;

  const fe = parseExtensionAndFormat(options.format ?? "esm");
  const format = ALLOW_FORMATS.has(fe.format as any) ? (fe.format as Bfsp.JsFormat) : "esm";
  const extension = fe.extension;
  let outDir = path.resolve(options.outRoot ?? projectDirpath, options.outDir ?? `dist`);
  if (options.outSubPath) {
    outDir = path.join(outDir, options.outSubPath);
  }
  outDir = path.join(outDir, format);

  const viteBuildConfig: Readonly<InlineConfig> = {
    root: projectDirpath,
    base: "./",
    cacheDir: "node_modules/.bfsp",
    envPrefix: ["BFSP_", "VITE_"],
    clearScreen: !debug.enabled,
    build: {
      target: userConfig.target ?? tsConfig.json.compilerOptions.target,
      outDir: outDir,
      minify: false,
      watch: {
        chokidar: { cwd: projectDirpath },
        clearScreen: !debug.enabled,
      },
      rollupOptions: {
        preserveEntrySignatures: "strict",
        external:
          format === "iife"
            ? (source) => {
                if (source.startsWith("node:")) {
                  return true;
                }
                if (source === "@bfchain/pkgm-bfsp" || source.startsWith("@bfchain/pkgm-bfsp/")) {
                  return true;
                }
              }
            : await getExternalOption(
                projectDirpath,
                userConfig.name,
                rootDepsInfo?.data.trees.find((t) => t.name.startsWith(userConfig.name + "@"))
              ),
        input: viteConfig.viteInput,
        output: {
          preserveModules: true,
          manualChunks: undefined,
          entryFileNames: `[name]${extension}`,
          chunkFileNames: `chunk/[name]${extension}`,
          format: format,
        },
      },
    },
    plugins: [
      (() => {
        const parsedTsConfig: $Typescript.TranspileOptions = JSON.parse(JSON.stringify(options.tsConfig.json));
        const compilerOptions = (parsedTsConfig.compilerOptions ||= {});
        compilerOptions.emitDeclarationOnly = false;
        compilerOptions.noEmit = false;
        compilerOptions.sourcemap = false;
        compilerOptions.inlineSources = false;
        compilerOptions.inlineSourceMap = false;
        let ts: typeof $Typescript | undefined;

        return {
          name: "tsc.emitDecoratorMetadata",
          async load(source: string) {
            // otherwise modules like 'vite/preload' will cause error
            if (!path.isAbsolute(source)) {
              return null;
            }
            if (!parsedTsConfig?.compilerOptions?.emitDecoratorMetadata) {
              return null;
            }

            try {
              const tsSource = fs.readFileSync(source, "utf8");
              if (!tsSource) {
                return null;
              }

              if (tsSource.includes("@") === false) {
                return null;
              }

              // Find the decorator and if there isn't one, return out
              const hasDecorator = tsSource
                .replace(/`(?:\.|(\\\`)|[^\``])*`|"(?:\.|(\\\")|[^\""\n])*"|'(?:\.|(\\\')|[^\''\n])*'/g, "")
                .replace(/\/\/[\w\W]*?\n/g, "")
                .replace(/\/\*[\w\W]*?\*\//g, "")
                .includes("@");
              if (!hasDecorator) {
                return null;
              }

              ts ??= await getTypescript();
              debug("need emitDecoratorMetadata", source);
              // fix ts.transpileModule is not a function
              const program = (ts?.transpileModule ?? transpileModule)(tsSource, parsedTsConfig);
              // log(program.outputText);
              return program.outputText;
            } catch (err) {
              logger.error("[Error Source]: %s", source);
              logger.error(err);
            }
            return null;
          },
        };
      })(),
      (() => {
        const profileImports = options.tsConfig.json.compilerOptions.paths;
        let keys: string[] = [];
        let moduleSuffixes: { [key: string]: string[] } = {};
        Object.keys(profileImports).map((key) => {
          let keyPath = path.resolve(projectDirpath, key.replace("#", "./"));
          keys.push(keyPath);
          moduleSuffixes[keyPath] = profileImports[key as Bfsp.Profile];
        });

        return {
          name: "moduleSuffixes replace",
          async resolveId(source: string, importer: string, options: any) {
            if (source.startsWith("./")) {
              const id = path.resolve(importer, "." + source);

              if (keys.includes(id) && moduleSuffixes && moduleSuffixes?.[id]?.[0]) {
                let suffixesid = path.resolve(projectDirpath, moduleSuffixes[id][0]);
                return suffixesid;
              }

              return id;
            }

            return null;
          },
        };
      })(),
      (() => {
        const profileImports = options.tsConfig.json.compilerOptions.paths;
        debug("profileImports", profileImports);
        return {
          name: "Profile imports",
          async resolveId(source: string, importer: string, options: any) {
            if (source.startsWith("#")) {
              debug("Profile import", source);
              const imports = profileImports[source as Bfsp.Profile];
              if (Array.isArray(imports)) {
                const id = path.resolve(projectDirpath, imports[0]);
                const resolution = await this.resolve(id, importer, { skipSelf: true, ...options });
                if (resolution) {
                  /**
                   * 之前这边用的是resolveId/load，通过添加#PROFILE#前缀的方案，但是这个方案在这个场景下有问题：
                   *
                   * 当有嵌套profile出现的时候，比如 从 #lib 引用了 #module， 那么当解析到#module的时候，importer就会
                   * 因为路径前面带了#PROFILE#而变得不正常了
                   *
                   * 因此选择在这边直接load
                   */
                  await this.load(resolution); // preload
                } else {
                  debug.error(`unable to resolve:  ${source}`);
                  return source; // can't resolve
                }
                return id;
              }
            }
            return null;
          },
        };
      })(),
    ],
    server: {
      fs: {
        // Allow serving files from one level up to the project root
        allow: ["./"],
      },
    },
  };

  return viteBuildConfig;
};
