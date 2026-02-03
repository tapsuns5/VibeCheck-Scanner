import { parse } from "@babel/parser";

export function parseTs(code: string) {
  return parse(code, {
    sourceType: "module",
    plugins: [
      "typescript",
      "jsx",
      "decorators-legacy",
      "classProperties",
      "classPrivateProperties",
      "classPrivateMethods",
      "dynamicImport",
      "importAssertions",
      "topLevelAwait"
    ]
  });
}
