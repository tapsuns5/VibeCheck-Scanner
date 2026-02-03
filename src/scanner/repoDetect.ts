import { existsSync } from "node:fs";
import path from "node:path";
import { readFile } from "node:fs/promises";
import type { RepoDetectResult, StackName } from "../engine/types.js";

function hasAny(root: string, files: string[]): boolean {
  return files.some((f) => existsSync(path.join(root, f)));
}

export async function detectRepo(
  rootDir: string
): Promise<{ repo: RepoDetectResult; deps: Record<string, string> }> {
  let stack: StackName = "auto";

  if (
    hasAny(rootDir, ["next.config.js", "next.config.mjs", "next.config.ts"]) ||
    existsSync(path.join(rootDir, "app"))
  ) {
    stack = "nextjs";
  } else if (hasAny(rootDir, ["vite.config.ts", "vite.config.js", "vite.config.mjs"])) {
    stack = "vite";
  } else if (hasAny(rootDir, ["nest-cli.json"]) || existsSync(path.join(rootDir, "src", "main.ts"))) {
    stack = "nestjs";
  }

  let deps: Record<string, string> = {};
  try {
    const pkg = JSON.parse(await readFile(path.join(rootDir, "package.json"), "utf8"));
    deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  } catch {}

  return { repo: { rootDir, stack }, deps };
}
