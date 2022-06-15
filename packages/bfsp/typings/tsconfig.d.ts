declare namespace Bfsp {
  interface TsConfig {
    /**
     * 不能直接使用 ts.CompilerOptions 直接替代那个是运行时的类型
     */
    compilerOptions: TsConfig.CompilerOptions;
  }
  namespace TsConfig {
    interface CompilerOptions {
      allowJs?: boolean;
      allowSyntheticDefaultImports?: boolean;
      allowUmdGlobalAccess?: boolean;
      allowUnreachableCode?: boolean;
      allowUnusedLabels?: boolean;
      alwaysStrict?: boolean;
      baseUrl?: string;
      charset?: string;
      checkJs?: boolean;
      declaration?: boolean;
      declarationMap?: boolean;
      emitDeclarationOnly?: boolean;
      declarationDir?: string;
      disableSizeLimit?: boolean;
      disableSourceOfProjectReferenceRedirect?: boolean;
      disableSolutionSearching?: boolean;
      disableReferencedProjectLoad?: boolean;
      downlevelIteration?: boolean;
      emitBOM?: boolean;
      emitDecoratorMetadata?: boolean;
      exactOptionalPropertyTypes?: boolean;
      experimentalDecorators?: boolean;
      forceConsistentCasingInFileNames?: boolean;
      importHelpers?: boolean;
      inlineSourceMap?: boolean;
      inlineSources?: boolean;
      isolatedModules?: boolean;
      keyofStringsOnly?: boolean;
      locale?: string;
      mapRoot?: string;
      maxNodeModuleJsDepth?: number;
      noEmit?: boolean;
      noEmitHelpers?: boolean;
      noEmitOnError?: boolean;
      noErrorTruncation?: boolean;
      noFallthroughCasesInSwitch?: boolean;
      noImplicitAny?: boolean;
      noImplicitReturns?: boolean;
      noImplicitThis?: boolean;
      noStrictGenericChecks?: boolean;
      noUnusedLocals?: boolean;
      noUnusedParameters?: boolean;
      noImplicitUseStrict?: boolean;
      noPropertyAccessFromIndexSignature?: boolean;
      assumeChangesOnlyAffectDirectDependencies?: boolean;
      noLib?: boolean;
      noResolve?: boolean;
      noUncheckedIndexedAccess?: boolean;
      preserveConstEnums?: boolean;
      noImplicitOverride?: boolean;
      preserveSymlinks?: boolean;
      preserveValueImports?: boolean;
      project?: string;
      reactNamespace?: string;
      jsxFactory?: string;
      jsxFragmentFactory?: string;
      jsxImportSource?: string;
      composite?: boolean;
      incremental?: boolean;
      tsBuildInfoFile?: string;
      removeComments?: boolean;
      skipLibCheck?: boolean;
      skipDefaultLibCheck?: boolean;
      sourceMap?: boolean;
      sourceRoot?: string;
      strict?: boolean;
      strictFunctionTypes?: boolean;
      strictBindCallApply?: boolean;
      strictNullChecks?: boolean;
      strictPropertyInitialization?: boolean;
      stripInternal?: boolean;
      suppressExcessPropertyErrors?: boolean;
      suppressImplicitAnyIndexErrors?: boolean;
      traceResolution?: boolean;
      useUnknownInCatchVariables?: boolean;
      resolveJsonModule?: boolean;
      moduleSuffixes?: string[];
      /** Paths used to compute primary types search locations */
      typeRoots?: string[];
      esModuleInterop?: boolean;
      useDefineForClassFields?: boolean;

      importsNotUsedAsValues?: CompilerOptions.ImportsNotUsedAsValues;
      moduleResolution?: CompilerOptions.ModuleResolutionKind;
      target?: CompilerOptions.TargetKind;
      module?: CompilerOptions.ModuleKind;
      lib?: Array<CompilerOptions.LibKind>;
      types?: Array<keyof CompilerOptions.TypeMap | string>;
      newLine?: CompilerOptions.NewLineKind;
      jsx?: CompilerOptions.JsxEmit;

      /// 以下这些不可被用户写入
      // paths?: MapLike<string[]>;
      // rootDir?: string;
      // rootDirs?: string[];
      // outDir?: string;
      // out?: string;
      // outFile?: string;
    }
    namespace CompilerOptions {
      type TargetKind =
        | "ES3"
        | "ES5"
        | "ES6"
        | "ES2015"
        | "ES2016"
        | "ES2017"
        | "ES2018"
        | "ES2019"
        | "ES2020"
        | "ES2021"
        | "ES2022"
        | "ESNEXT";

      type ModuleKind =
        | "None"
        | "CommonJS"
        | "AMD"
        | "UMD"
        | "System"
        | "ES6"
        | "ES2015"
        | "ES2020"
        | "ESNext"
        | "ES2022"
        | "Node12"
        | "NodeNext";

      type LibKind =
        | "ES5"
        | "ES6"
        | "ES2015"
        | "ES2015.Collection"
        | "ES2015.Core"
        | "ES2015.Generator"
        | "ES2015.Iterable"
        | "ES2015.Promise"
        | "ES2015.Proxy"
        | "ES2015.Reflect"
        | "ES2015.Symbol.WellKnown"
        | "ES2015.Symbol"
        | "ES2016"
        | "ES2016.Array.Include"
        | "ES2017"
        | "ES2017.Intl"
        | "ES2017.Object"
        | "ES2017.SharedMemory"
        | "ES2017.String"
        | "ES2017.TypedArrays"
        | "ES2018"
        | "ES2018.AsyncGenerator"
        | "ES2018.AsyncIterable"
        | "ES2018.Intl"
        | "ES2018.Promise"
        | "ES2018.Regexp"
        | "ES2019"
        | "ES2019.Array"
        | "ES2019.Object"
        | "ES2019.String"
        | "ES2019.Symbol"
        | "ES2020"
        | "ES2020.BigInt"
        | "ES2020.Promise"
        | "ES2020.String"
        | "ES2020.Symbol.WellKnown"
        | "ESNext"
        | "ESNext.Array"
        | "ESNext.AsyncIterable"
        | "ESNext.BigInt"
        | "ESNext.Intl"
        | "ESNext.Promise"
        | "ESNext.String"
        | "ESNext.Symbol"
        | "DOM"
        | "DOM.Iterable"
        | "ScriptHost"
        | "WebWorker"
        | "WebWorker.ImportScripts"
        | "Webworker.Iterable"
        | "ES7"
        | "ES2021"
        | "ES2020.SharedMemory"
        | "ES2020.Intl"
        | "ES2021.Promise"
        | "ES2021.String"
        | "ES2021.WeakRef"
        | "ESNext.WeakRef"
        | "es2021.intl";

      type ModuleResolutionKind = "Classic" | "Node" | "Node12" | "NodeNext";

      type ImportsNotUsedAsValues = "remove" | "preserve" | "error";

      type NewLineKind = "crlf" | "lf";

      type JsxEmit = "preserve" | "react" | "react-jsx" | "react-jsxdev" | "react-native";

      /**
       * @todo 这里写成 interface 的形式，目的是未来可以通过 @types/bfchain__pkgm-bfsp 的项目，动态地将用户 `@types` 目录下的文件夹列出来 */
      interface TypeMap {
        node: "@types/node";
      }
    }
  }
}
