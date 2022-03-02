import fs, { existsSync, statSync } from "node:fs";
import { inspect } from "node:util";
import path from "node:path";
import typescript from "typescript";
import type { InlineConfig } from "vite";
import { $TsConfig } from "../../src/configs/tsConfig";
import type { $ViteConfig } from "../../src/configs/viteConfig";
import { ALLOW_FORMATS } from "../../src/configs/bfspUserConfig";
import { Debug } from "../../src/logger";
import { parseExtensionAndFormat } from "../../src/toolkit";
import { BuildService } from "../../src/buildService";
const log = Debug("bfsp:config/vite");

export const ViteConfigFactory = (options: {
  userConfig: Bfsp.UserConfig;
  projectDirpath: string;
  viteConfig: $ViteConfig;
  tsConfig: $TsConfig;
  buildService: BuildService;
  format?: Bfsp.Format;
  profiles?: string[];
  outDir?: string;
}) => {
  const { projectDirpath, viteConfig } = options;

  const fe = parseExtensionAndFormat(options.format ?? "esm");
  const format = ALLOW_FORMATS.has(fe.format as any) ? (fe.format as Bfsp.JsFormat) : "esm";
  const extension = fe.extension;
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
            ? (source) => {
                if (source.startsWith("node:")) {
                  return true;
                }
                if (source === "@bfchain/pkgm-bfsp" || source.startsWith("@bfchain/pkgm-bfsp/")) {
                  return true;
                }
              }
            : (source, importer, isResolved) => {
                log("external", source);
                if (source.startsWith("#")) {
                  // profile
                  return false;
                }

                // 通过编译服务确定包是否应标记为外部
                const { rollup } = options.buildService;
                if (rollup) {
                  if (rollup.isExternal(source, importer, isResolved)) {
                    return true;
                  }
                }

                // 用户声明为internal的包（通常是子包），要打包进去
                const internal = options.userConfig.internal;
                if (internal) {
                  if (typeof internal === "function") {
                    return !internal(source);
                  } else {
                    return ![...internal].some((x) => x === source);
                  }
                }
                if (source.startsWith("node:")) {
                  return true;
                }
                if (source === "@bfchain/pkgm-bfsp" || source.startsWith("@bfchain/pkgm-bfsp/")) {
                  return true;
                }
                if (
                  !source.startsWith(".") &&
                  existsSync(`node_modules/${source}`) &&
                  statSync(`node_modules/${source}`).isDirectory()
                ) {
                  return true;
                }
                return false;
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
            if (source.startsWith("#")) {
              log("Profile import", source);
              const imports = profileImports[source as Bfsp.Profile];
              if (Array.isArray(imports)) {
                return path.resolve(projectDirpath, imports[0]) + profileExternalId;
              }
            }
            return null;
          },
          load(source: string) {
            if (source.endsWith(profileExternalId)) {
              return fs.readFileSync(source.slice(0, -`${profileExternalId}`.length), "utf-8");
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
