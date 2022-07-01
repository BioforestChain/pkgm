import type { ModuleFormat } from "@bfchain/pkgm-base/lib/rollup.mjs";
const EXTENSION_MAP = {
  es: ".mjs",
  esm: ".mjs",
  module: ".mjs",
  cjs: ".cjs",
  commonjs: ".cjs",
  iife: ".js",
};
export const parseExtensionAndFormat = (format: ModuleFormat | Bfsp.Format) => {
  if (typeof format === "object") {
    return { format: format.format, extension: format.ext };
  }
  return { format: format, extension: ((EXTENSION_MAP as any)[format] || ".js") as Bfsp.JsFormat };
};

export const ALLOW_FORMATS = new Set<Bfsp.JsFormat>(["iife", "cjs", "esm"]);
export const isAllowedJsFormat = (format: any): format is Bfsp.JsFormat => {
  return ALLOW_FORMATS.has(format as any);
};
export const toAllowedJsFormat = (format: any) => {
  return isAllowedJsFormat(format) ? format : undefined;
};
export const parseFormats = (formats: Bfsp.Format[] = []) => {
  const feList = formats.map((f) => parseExtensionAndFormat(f)).filter((fe) => ALLOW_FORMATS.has(fe.format as any));
  const feMap = new Map(feList.map((fe) => [fe.format + "/" + fe.extension, fe]));
  const validFeList = [...feMap.values()];
  if (validFeList.length === 0) {
    validFeList.push(parseExtensionAndFormat("esm"));
  }
  return validFeList as {
    format: Bfsp.JsFormat;
    extension: Bfsp.JsExtension;
  }[];
};
