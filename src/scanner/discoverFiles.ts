import fg from "fast-glob";
import path from "node:path";
import type { CheckerConfig } from "../engine/types.js";

export async function discoverFiles(rootDir: string, config: CheckerConfig): Promise<string[]> {
  const patterns = ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx", "**/*.mjs", "**/*.cjs"];

  const ignore = [
    "**/node_modules/**",
    "**/.next/**",
    "**/dist/**",
    "**/build/**",
    "**/.turbo/**",
    "**/.git/**",
    ...(config.ignore ?? [])
  ];

  const entries = await fg(patterns, { cwd: rootDir, absolute: true, dot: true, ignore });
  return entries.map((p) => path.resolve(p));
}
