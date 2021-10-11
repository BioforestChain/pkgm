import type { InlineConfig } from "vite";
import path from "node:path";
import fs from "node:fs";
import { inspect } from "node:util";
import typescript from "typescript";
import { getBfspProjectConfig } from "../src/bfspConfig";
import { generateViteConfig } from "../src/gen/viteConfig";

const FORMATS = ["esm", "cjs"] as const;
type $Format = typeof FORMATS[number];

const EXTENSION_MAP = {
  es: ".mjs",
  esm: ".mjs",
  module: ".mjs",
  cjs: ".cjs",
  commonjs: ".cjs",
};

export const getArg = <T extends string>(name: string) => {
  const foundArg = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (foundArg) {
    const index = foundArg.indexOf("=");
    return foundArg.slice(index + 1) as unknown as T;
  }
};

export const ViteConfigFactory = async (options: {
  projectDirpath: string;
  format?: $Format;
  platform?: string;
}) => {
  const config = await getBfspProjectConfig(options.projectDirpath);
  if (config === undefined) {
    console.error("no found #bfsp project");
    return process.exit(1);
  }
  const viteConfig = await generateViteConfig(
    config.projectDirpath,
    config.userConfig
  );

  let {
    format = getArg("format") ?? "esm",
    platform = getArg("platfrom") ?? "default",
  } = options;
  if (FORMATS.includes(format as any) === false) {
    format = "esm";
  }
  const extension = EXTENSION_MAP[format] || ".js";
  const outDir = format ? `dist/${format}` : undefined;

  const viteBuildConfig: InlineConfig = {
    root: config.projectDirpath,
    base: "./",
    cacheDir: "node_modules/.bfsp",
    envPrefix: ["BFSP_", "VITE_"],
    build: {
      target: ["chrome74", "node16"],
      outDir: outDir,
      rollupOptions: {
        preserveEntrySignatures: "strict",
        external: [/^@bfchain\/.*/, /^node:.*/, "tslib", "js-yaml"],
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
        const tsconfigFilepath = path.join(
          config.projectDirpath,
          "tsconfig.json"
        );
        // console.log(tsconfigFilepath);
        const parsedTsConfig: typescript.TranspileOptions = new Function(
          `return ${fs.readFileSync(tsconfigFilepath, "utf-8").trim()}`
        )();
        const compilerOptions = (parsedTsConfig.compilerOptions ||= {});
        compilerOptions.emitDeclarationOnly = false;
        compilerOptions.noEmit = false;
        compilerOptions.sourcemap = false;
        compilerOptions.inlineSources = false;
        compilerOptions.inlineSourceMap = false;

        function printDiagnostics(...args: unknown[]) {
          console.log(inspect(args, false, 10, true));
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
                .replace(
                  /`(?:\.|(\\\`)|[^\``])*`|"(?:\.|(\\\")|[^\""\n])*"|'(?:\.|(\\\')|[^\''\n])*'/g,
                  ""
                )
                .replace(/\/\/[\w\W]*?\n/g, "")
                .replace(/\/\*[\w\W]*?\*\//g, "")
                .includes("@");
              if (!hasDecorator) {
                return null;
              }

              // console.log("need emitDecoratorMetadata", source);
              const program = typescript.transpileModule(ts, parsedTsConfig);
              // console.log(program.outputText);
              return program.outputText;
            } catch (err) {
              printDiagnostics({ file: source, err });
            }
            return null;
          },
        };
      })(),
      (() => {
        const packageFilepath = path.join(
          config.projectDirpath,
          "package.json"
        );
        const packageJson = JSON.parse(
          fs.readFileSync(packageFilepath, "utf-8")
        );
        const subpathImports = packageJson.imports || {};
        // console.log(subpathImports);
        return {
          name: "Subpath imports",
          resolveId(source: string) {
            // console.log(source);
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
