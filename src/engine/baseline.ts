import { readFile, writeFile } from "node:fs/promises";
import type { Finding } from "./types.js";

export interface Baseline {
  version: 1;
  items: { key: string; count: number }[];
}

export function keyOf(f: Finding): string {
  return [f.ruleId, f.severity, f.file, String(f.line ?? ""), String(f.col ?? ""), f.message].join("|");
}

export async function loadBaseline(p: string): Promise<Baseline> {
  try {
    return JSON.parse(await readFile(p, "utf8"));
  } catch {
    return { version: 1, items: [] };
  }
}

export async function writeBaseline(p: string, findings: Finding[]): Promise<void> {
  const counts = new Map<string, number>();
  for (const f of findings) {
    const k = keyOf(f);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const baseline: Baseline = {
    version: 1,
    items: Array.from(counts.entries()).map(([key, count]) => ({ key, count }))
  };
  await writeFile(p, JSON.stringify(baseline, null, 2), "utf8");
}

export function applyBaseline(findings: Finding[], baseline: Baseline): Finding[] {
  const seen = new Map<string, number>();
  const allowed = new Map(baseline.items.map((i) => [i.key, i.count]));
  const out: Finding[] = [];
  for (const f of findings) {
    const k = keyOf(f);
    const cur = seen.get(k) ?? 0;
    const lim = allowed.get(k) ?? 0;
    if (cur < lim) {
      seen.set(k, cur + 1);
      continue;
    }
    out.push(f);
  }
  return out;
}
