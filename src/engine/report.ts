import chalk from "chalk";
import type { Finding, Severity } from "./types.js";

const ORDER: Severity[] = ["blocker", "high", "med", "low", "info"];
const COLOR: Record<Severity, (s: string) => string> = {
  blocker: chalk.redBright,
  high: chalk.red,
  med: chalk.yellow,
  low: chalk.blue,
  info: chalk.gray
};

export function summarize(findings: Finding[]) {
  return findings.reduce(
    (acc, f) => {
      (acc as any)[f.severity] += 1;
      return acc;
    },
    { blocker: 0, high: 0, med: 0, low: 0, info: 0 }
  );
}

export function printConsole(findings: Finding[]) {
  const sorted = [...findings].sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity));
  for (const f of sorted) {
    const tag = f.severity.toUpperCase();
    const loc = f.line != null ? `${f.file}:${f.line}:${f.col ?? 0}` : f.file;
    console.log(`${COLOR[f.severity](`${tag} [${f.ruleId}]`)} ${loc}`);
    console.log(`  ${f.message}`);
    if (f.fixHint) console.log(`  Fix: ${f.fixHint}`);
    console.log();
  }
}

export function exitCode(findings: Finding[], strict: boolean): number {
  if (!strict) return 0;
  const s = summarize(findings);
  if (s.blocker) return 2;
  if (s.high) return 1;
  return 0;
}
