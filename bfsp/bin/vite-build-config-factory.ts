import fs, { existsSync, statSync } from "node:fs";
import { inspect } from "node:util";
import path from "node:path";
import typescript from "typescript";
import type { InlineConfig } from "vite";
import { $TsConfig } from "../src/configs/tsConfig";
import type { $ViteConfig } from "../src/configs/viteConfig";
import { Debug } from "../src/logger";
import { getExtensionByFormat } from "../src/toolkit";
const log = Debug("bfsp:config/vite");

const FORMATS = ["cjs", "esm", "iife"] as const;

export const ViteConfigFactory = (options: {
  projectDirpath: string;
  viteConfig: $ViteConfig;
  tsConfig: $TsConfig;
  format?: Bfsp.Format;
  profiles?: string[];
  outDir?: string;
}) => {
  let { format = "esm", profiles = ["default"] } = options;
  if (FORMATS.includes(format as any) === false) {
    format = "esm";
  }
  const { projectDirpath, viteConfig } = options;
  const extension = getExtensionByFormat(format);
  const outDir = options.outDir || (format ? `dist/${format}` : undefined);

  const viteBuildConfig: Readonly<InlineConfig> = {
    root: projectDirpath,
    base: "./",
    cacheDir: "node_modules/.bfsp",
    envPrefix: ["BFSP_", "VITE_"],
    clearScreen: !log.enabled,
    build: {
      target: ["chrome74", "node16"],
      outDir: outDir,
      watch: {
        chokidar: { cwd: projectDirpath },
        clearScreen: !log.enabled,
      },
      rollupOptions: {
        preserveEntrySignatures: "strict",
        external:
          format === "iife"
            ? undefined
            : (source, importer, isResolved) => {
                if (source.startsWith("node:")) {
                  return true;
                }
                if (source.startsWith("@bfchain/") || source.includes("node_modules/@bfchain/")) {
                  return false;
                }
                if (source.includes("node_modules")) {
                  return true;
                }
                if (
                  !source.startsWith(".") &&
                  existsSync(`node_modules/${source}`) &&
                  statSync(`node_modules/${source}`).isDirectory()
                ) {
                  return true;
                }
              },
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

        function printDiagnostics(...args: unknown[]) {
          console.error(inspect(args, false, 10, true));
        }

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

              log("need emitDecoratorMetadata", source);
              const program = typescript.transpileModule(ts, parsedTsConfig);
              // log(program.outputText);
              return program.outputText;
            } catch (err) {
              printDiagnostics({ file: source, err });
            }
            return null;
          },
        };
      })(),
      (() => {
        const profileImports = options.tsConfig.json.compilerOptions.paths;
        log("profileImports", profileImports);
        const profileExternalId = "#PROFILE#";
        return {
          name: "Profile imports",
          resolveId(source: string) {
            log("Profile imports", source);
            if (source.startsWith("#")) {
              const imports = profileImports[source as Bfsp.Profile];
              if (Array.isArray(imports)) {
                return profileExternalId + path.resolve(projectDirpath, imports[0]);
              }
            }
            return null;
          },
          load(source: string) {
            if (source.startsWith(profileExternalId)) {
              return fs.readFileSync(source.slice(profileExternalId.length), "utf-8");
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
