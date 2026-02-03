import path from "node:path";
import { readFile } from "node:fs/promises";
import fg from "fast-glob";
import type { CheckerConfig } from "./types.js";
import {
  discoverAuthGuardsFromCode,
  shouldScanFileForGuards,
} from "../utils/discoverAuthGuards.js";

const CONFIG_FILES = [
  "vibecheck.json",
  "vibecheck.config.json",
  ".vibecheckrc.json",
];

export async function loadConfig(
  rootDir: string,
  override: Partial<CheckerConfig>,
  deps: Record<string, string>,
): Promise<CheckerConfig> {
  let fileConfig: Partial<CheckerConfig> = {};
  for (const name of CONFIG_FILES) {
    try {
      fileConfig = JSON.parse(await readFile(path.join(rootDir, name), "utf8"));
      break;
    } catch {}
  }

  const merged: CheckerConfig = {
    stack: "auto",
    auth: "auto",
    authGuards: ["getServerSession", "auth", "unstable_getServerSession"],
    ignore: [],
    maxFileBytes: 1_000_000,
    ...fileConfig,
    ...override,
  };

  // best-effort: discover guard helper names in your repo (so rules can check for them)
  try {
    const candidates = await fg(
      ["src/**/*.ts", "src/**/*.tsx", "app/**/*.ts", "app/**/*.tsx"],
      {
        cwd: rootDir,
        absolute: true,
        dot: true,
        ignore: ["**/node_modules/**", "**/dist/**", "**/.next/**"],
      },
    );

    const found = new Set<string>();
    for (const abs of candidates.slice(0, 400)) {
      const rp = abs.startsWith(rootDir) ? abs.slice(rootDir.length + 1) : abs;
      if (!shouldScanFileForGuards(rp)) continue;
      const code = await readFile(abs, "utf8").catch(() => "");
      for (const g of discoverAuthGuardsFromCode(code)) found.add(g);
    }

    if (found.size) {
      merged.authGuards = Array.from(new Set([...merged.authGuards, ...found]));
    }
  } catch {}

  void deps;
  return merged;
}
