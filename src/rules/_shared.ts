import { toPosix } from "../utils/path.js";
import type { RuleContext } from "../engine/types.js";

export function rel(ctx: RuleContext, abs: string): string {
  return abs.startsWith(ctx.rootDir) ? toPosix(abs.slice(ctx.rootDir.length + 1)) : toPosix(abs);
}

export function isNextApiRoute(relPath: string): boolean {
  const p = toPosix(relPath);
  return p.startsWith("app/api/") || p.includes("/app/api/");
}

export function firstLineCol(code: string, idx: number): { line: number; col: number } {
  const pre = code.slice(0, Math.max(0, idx));
  const lines = pre.split(/\r?\n/);
  return { line: lines.length, col: lines[lines.length - 1].length };
}
