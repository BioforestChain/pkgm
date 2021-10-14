import debug from "debug";
import fs, { existsSync, statSync } from "node:fs";
import { inspect } from "node:util";
import typescript from "typescript";
import type { InlineConfig } from "vite";
import { $PackageJson } from "../src/configs/packageJson";
import { $TsConfig } from "../src/configs/tsConfig";
import type { $ViteConfig } from "../src/configs/viteConfig";
import { getExtensionByFormat } from "../src/toolkit";
const log = debug("bfsp:config/vite-config.ts");

const FORMATS = ["cjs", "esm", "iife"] as const;
type $Format = typeof FORMATS[number];

export const getArg = <T extends string>(name: string) => {
  const foundArg = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (foundArg) {
    const index = foundArg.indexOf("=");
    return foundArg.slice(index + 1) as unknown as T;
  }
};

export const ViteConfigFactory = (options: {
  projectDirpath: string;
  viteConfig: $ViteConfig;
  packageJson: $PackageJson;
  tsConfig: $TsConfig;
  format?: $Format;
  platform?: string;
}) => {
  let { format = getArg("format") ?? "esm", platform = getArg("platfrom") ?? "default" } = options;
  if (FORMATS.includes(format as any) === false) {
    format = "esm";
  }
  const { projectDirpath, viteConfig } = options;
  const extension = getExtensionByFormat(format);
  const outDir = format ? `dist/${format}` : undefined;

  const viteBuildConfig: InlineConfig = {
    root: projectDirpath,
    base: "./",
    cacheDir: "node_modules/.bfsp",
    envPrefix: ["BFSP_", "VITE_"],
    clearScreen: !log.enabled,
    build: {
      target: ["chrome74", "node16"],
      outDir: outDir,
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
        const parsedTsConfig: typescript.TranspileOptions = JSON.parse(JSON.stringify(options.tsConfig));
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
        const subpathImports: any = options.packageJson.imports || {};
        log("subpathImports", subpathImports);
        return {
          name: "Subpath imports",
          resolveId(source: string) {
            if (source.startsWith("#")) {
              const imports = subpathImports[source];
              if (imports) {
                return imports[platform] ?? imports.default ?? null;
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
