import { defineConfig } from "vite";
import typescript from "typescript";
import fs from "node:fs";
import path from "node:path";
import { inspect } from "node:util";
import { fileURLToPath } from "node:url";
import type { InputOption, ModuleFormat } from "rollup";

const libFormat = process.argv
  .find((arg) => arg.startsWith("--format="))
  ?.split("=")[1] as ModuleFormat;

const targetPlatform = process.argv
  .find((arg) => arg.startsWith("--platform="))
  ?.split("=")[1] as "node" | "web";

export const input: InputOption = {
  /*@EXPORTS@*/
};

const outDir = libFormat ? `dist/${libFormat}` : undefined;

const extension =
  {
    es: ".mjs",
    esm: ".mjs",
    module: ".mjs",
    cjs: ".cjs",
    commonjs: ".cjs",
    umd: ".js",
    system: ".js",
    systemjs: ".js",
    iife: ".js",
    amd: ".js",
  }[libFormat] || ".js";

// https://vitejs.dev/config/
export default defineConfig((info) => {
  return {
    build: {
      target: ["chrome74", "node16"],
      outDir: outDir,
      rollupOptions: {
        preserveEntrySignatures: "strict",
        external: [/^@bfchain\/.*/, /^node:.*/, "tslib", "js-yaml"],
        input,
        output: {
          entryFileNames: `[name]${extension}`,
          chunkFileNames: `chunk/[name]${extension}`,
          format: libFormat,
        },
      },
    },
    plugins: [
      (() => {
        const tsconfigFilepath = fileURLToPath(
          new URL("tsconfig.json", import.meta.url).href
        );
        console.log(tsconfigFilepath);
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
          fileURLToPath(import.meta.url),
          "../package.json"
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
                return imports[targetPlatform] ?? imports.default ?? null;
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
});
