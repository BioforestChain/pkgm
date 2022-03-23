import { typescript } from "@bfchain/pkgm-base/lib/typescript";
import type { InlineConfig } from "@bfchain/pkgm-base/lib/vite";
import { getExternalOption } from "@bfchain/pkgm-base/vite-config-helper";
import fs from "node:fs";
import path from "node:path";
import { ALLOW_FORMATS } from "../../src/configs/bfspUserConfig";
import { $TsConfig } from "../../src/configs/tsConfig";
import type { $ViteConfig } from "../../src/configs/viteConfig";
import { DevLogger } from "../../src/logger";
import { parseExtensionAndFormat } from "../../src/toolkit";
const debug = DevLogger("bfsp:config/vite");

export const ViteConfigFactory = (options: {
  userConfig: Bfsp.UserConfig;
  projectDirpath: string;
  viteConfig: $ViteConfig;
  tsConfig: $TsConfig;
  format?: Bfsp.Format;
  profiles?: string[];
  outDir?: string;
  outRoot?: string;
  logger: PKGM.Logger;
}) => {
  const { userConfig, tsConfig, projectDirpath, viteConfig } = options;
  const logger = options.logger;

  const fe = parseExtensionAndFormat(options.format ?? "esm");
  const format = ALLOW_FORMATS.has(fe.format as any) ? (fe.format as Bfsp.JsFormat) : "esm";
  const extension = fe.extension;
  const outDir = path.resolve(options.outRoot ?? projectDirpath, options.outDir ?? `dist/${format}`);

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
            : getExternalOption(projectDirpath, userConfig.name),
        input: viteConfig.viteInput,
        output: {
          entryFileNames: `[name]${extension}`,
          chunkFileNames: `chunk/[name]${extension}`,
          format: format,
        },
      },
    },
    plugins: [
      (() => {
        const parsedTsConfig: typescript.TranspileOptions = JSON.parse(JSON.stringify(options.tsConfig.json));
        const compilerOptions = (parsedTsConfig.compilerOptions ||= {});
        compilerOptions.emitDeclarationOnly = false;
        compilerOptions.noEmit = false;
        compilerOptions.sourcemap = false;
        compilerOptions.inlineSources = false;
        compilerOptions.inlineSourceMap = false;

        return {
          name: "tsc.emitDecoratorMetadata",
          load(source: string) {
            if (!parsedTsConfig?.compilerOptions?.emitDecoratorMetadata) {
              return null;
            }

            try {
              const ts = fs.readFileSync(source, "utf8");
              if (!ts) {
                return null;
              }

              if (ts.includes("@") === false) {
                return null;
              }

              // Find the decorator and if there isn't one, return out
              const hasDecorator = ts
                .replace(/`(?:\.|(\\\`)|[^\``])*`|"(?:\.|(\\\")|[^\""\n])*"|'(?:\.|(\\\')|[^\''\n])*'/g, "")
                .replace(/\/\/[\w\W]*?\n/g, "")
                .replace(/\/\*[\w\W]*?\*\//g, "")
                .includes("@");
              if (!hasDecorator) {
                return null;
              }

              debug("need emitDecoratorMetadata", source);
              const program = typescript.transpileModule(ts, parsedTsConfig);
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
                  this.load(resolution); // preload
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
