import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import type { Plugin } from "@bfchain/pkgm-base/lib/esbuild";
import { $Typescript, getTypescript, transpileModule } from "@bfchain/pkgm-base/lib/typescript";
import { $TsConfig } from "../../src/configs/tsConfig";
import { DevLogger } from "../../sdk/logger/logger";
const debug = DevLogger("bfsp:config/esbuild");

export const EsbuildConfigPlugins = (options: {
  projectDirpath: string;
  tsConfig: $TsConfig;
  logger: PKGM.Logger;
}): Plugin[] => {
  const { projectDirpath, tsConfig, logger } = options;

  return [
    {
      name: "import.meta.url",
      setup({ onLoad }) {
        onLoad({ filter: /\.ts$/ }, ({ path: source }) => {
          let code = fs.readFileSync(source, "utf8");

          if (code.includes("import.meta.url")) {
            code = code.replace(/\bimport\.meta\.url\b/g, JSON.stringify(url.pathToFileURL(source)));
            return { contents: code };
          }

          return null;
        });
      },
    },
    {
      name: "tsc.emitDecoratorMetadata",
      setup({ onLoad }) {
        const parsedTsConfig: $Typescript.TranspileOptions = JSON.parse(JSON.stringify(tsConfig.json));
        const compilerOptions = (parsedTsConfig.compilerOptions ||= {});
        compilerOptions.emitDeclarationOnly = false;
        compilerOptions.noEmit = false;
        compilerOptions.sourcemap = false;
        compilerOptions.inlineSources = false;
        compilerOptions.inlineSourceMap = false;
        let ts: typeof $Typescript | undefined;

        onLoad({ filter: /\.ts$/ }, async ({ path: source }) => {
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
            return { contents: program.outputText };
          } catch (err) {
            logger.error("[Error Source]: %s", source);
            logger.error(err);
          }
          return null;
        });
      },
    },
    {
      name: "profiles.imports",
      setup({ onResolve, onLoad }) {
        const profileImports = tsConfig.json.compilerOptions.paths;
        debug("profileImports", profileImports);
        const profileExternalId = "#PROFILE#";

        onResolve({ filter: /\.ts$/ }, ({ path: source }) => {
          if (source.startsWith("#")) {
            debug("Profile import", source);
            if (source.startsWith("#")) {
              const imports = profileImports[source as Bfsp.Profile];
              if (Array.isArray(imports)) {
                return {
                  path: path.resolve(projectDirpath, imports[0]) + profileExternalId,
                  namespace: "profile",
                };
              }
            }
          }
          return { path: "" };
        });
        onLoad({ filter: /.*/, namespace: "profile" }, ({ path: source }) => {
          if (source.endsWith(profileExternalId)) {
            return {
              contents: fs.readFileSync(source.slice(0, -`${profileExternalId}`.length), "utf-8"),
            };
          }
          return null;
        });
      },
    },
  ];
};
