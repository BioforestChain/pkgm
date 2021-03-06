import { getPrettier, BuiltInParserName } from "@bfchain/pkgm-base/lib/prettier.mjs";

// export const doFormat = async (options: { root: string }) => {
//   prettier.format;
// };
export const formatCode = async (code: string, parser: BuiltInParserName) => {
  return (await getPrettier()).format(code, { parser });
};
export const ts = (tsa: TemplateStringsArray, ...args: unknown[]) => {
  let code = tsa[0];
  for (let i = 1; i < tsa.length; ++i) {
    code += args[i - 1] + tsa[i];
  }
  return formatCode(code, "typescript");
};
