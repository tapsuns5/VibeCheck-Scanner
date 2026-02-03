import type { Rule, Finding } from "../../engine/types.js";
import { rel, firstLineCol } from "../_shared.js";

/**
 * prisma-write-tenant-boundary (ultra low-noise)
 *
 * Philosophy:
 * - TRUE issue: Prisma referenced in a Client Component => HIGH.
 * - Heuristic issue: updateMany/deleteMany without tenant keys => INFO (or MED if you prefer).
 *
 * Defaults:
 * - Only checks updateMany/deleteMany (not update/delete/create).
 * - Only scans server-ish folders for the tenant heuristic.
 * - Does NOT do guessy parsing: only inline object literal args; otherwise skip.
 */

function isCodeFile(p: string) {
  return /\.(ts|tsx|js|jsx)$/.test(p);
}

function isClientComponent(code: string) {
  const head = code.slice(0, 250);
  return /(^|\n)\s*["']use client["']\s*;?\s*(\n|$)/.test(head);
}

function findAllCallSites(code: string, callName: string): number[] {
  const idxs: number[] = [];
  const re = new RegExp(`\\.${callName}\\s*\\(`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) idxs.push(m.index);
  return idxs;
}

function sliceAround(code: string, idx: number, before = 200, after = 4000) {
  const start = Math.max(0, idx - before);
  const end = Math.min(code.length, idx + after);
  return { start, text: code.slice(start, end) };
}

/**
 * Extract first argument ONLY if it is an inline object literal: `{ ... }`
 * If it’s `args` or `getArgs()` etc -> return null (skip).
 */
function extractInlineFirstArgObject(snippet: string): string | null {
  const openParen = snippet.indexOf("(");
  if (openParen < 0) return null;

  // Skip whitespace/comments after '('
  let i = openParen + 1;
  while (i < snippet.length) {
    const ch = snippet[i];
    // whitespace
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    // line comment
    if (ch === "/" && snippet[i + 1] === "/") {
      const nl = snippet.indexOf("\n", i + 2);
      if (nl < 0) return null;
      i = nl + 1;
      continue;
    }
    // block comment
    if (ch === "/" && snippet[i + 1] === "*") {
      const end = snippet.indexOf("*/", i + 2);
      if (end < 0) return null;
      i = end + 2;
      continue;
    }
    break;
  }

  // Must be an inline object literal
  if (snippet[i] !== "{") return null;

  const firstBrace = i;
  let depth = 0;
  for (let j = firstBrace; j < snippet.length; j++) {
    const ch = snippet[j];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    if (depth === 0) return snippet.slice(firstBrace, j + 1);
  }
  return null;
}

function extractWhereBlock(argObj: string): string | null {
  const whereIdx = argObj.search(/\bwhere\s*:/);
  if (whereIdx < 0) return null;

  const afterWhere = argObj.slice(whereIdx);
  const braceIdx = afterWhere.indexOf("{");
  if (braceIdx < 0) return null;

  let depth = 0;
  const start = whereIdx + braceIdx;
  for (let i = start; i < argObj.length; i++) {
    const ch = argObj[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    if (depth === 0) return argObj.slice(start, i + 1);
  }
  return null;
}

function hasSuppression(code: string, absIdx: number): boolean {
  const start = Math.max(0, absIdx - 300);
  const window = code.slice(start, absIdx);
  return /vibecheck:tenant-ok/.test(window);
}

function whereHasTenantKey(whereBlock: string, tenantKeys: string[]): boolean {
  for (const key of tenantKeys) {
    const re = new RegExp(`\\b${key}\\b\\s*:`, "m");
    if (re.test(whereBlock)) return true;
  }
  return false;
}

function simplePathMatch(rp: string, patterns: string[]) {
  // intentionally simple substring-ish matching (no minimatch dep)
  return patterns.some((p) => {
    const token = p.replace(/\*\*/g, "").replace(/\*/g, "");
    return token && rp.includes(token);
  });
}

export const prismaWriteTenantBoundaryRule: Rule = {
  id: "prisma-write-tenant-boundary",
  description:
    "Detect Prisma updateMany/deleteMany that may be missing tenant/workspace/org constraints (low-noise).",
  stack: ["nextjs", "auto"],

  async run(ctx) {
    const out: Finding[] = [];

    const tenantKeys: string[] = (ctx.config as any)?.tenantKeys ?? [
      "workspaceId",
      "orgId",
      "tenantId",
      "accountId",
      "teamId",
    ];

    // Default: only scan server-ish areas for the heuristic.
    const onlyPaths: string[] = (ctx.config as any)?.tenantBoundaryOnly ?? [
      "app/api/",
      "lib/server/",
      "server/",
      "prisma/",
    ];

    const ignorePaths: string[] = (ctx.config as any)?.tenantBoundaryIgnore ?? [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
    ];

    for (const abs of ctx.files) {
      const rp = rel(ctx, abs);
      if (!isCodeFile(rp)) continue;
      if (simplePathMatch(rp, ignorePaths)) continue;

      const code = await ctx.readFile(abs);
      if (!code) continue;

      // If this is a client component and it references prisma at all => HIGH
      if (isClientComponent(code) && code.includes("prisma.")) {
        const idx = code.indexOf("prisma.");
        out.push({
          ruleId: "prisma-write-tenant-boundary",
          severity: "high",
          file: abs,
          ...firstLineCol(code, Math.max(0, idx)),
          message:
            'Client component ("use client") references Prisma. Prisma must never run/bundle in client-side code.',
          fixHint:
            "Move Prisma calls into a Route Handler (app/api/*), Server Action, or a server-only module (lib/server/*). Client should call the server via fetch/action.",
        });
        // No tenant heuristic for client file; the client issue is the priority.
        continue;
      }

      // If onlyPaths set, require match for the tenant heuristic.
      if (onlyPaths?.length && !simplePathMatch(rp, onlyPaths)) continue;

      // Only high-risk calls
      const calls = [
        // Drop to INFO to match your “med/high only = big security issues”
        { name: "updateMany", severity: "info" as const },
        { name: "deleteMany", severity: "info" as const },
      ];

      // Cap findings per file to keep output tight
      let fileFindings = 0;
      const FILE_CAP = 6;

      for (const c of calls) {
        if (fileFindings >= FILE_CAP) break;

        const idxs = findAllCallSites(code, c.name);

        for (const idx of idxs) {
          if (fileFindings >= FILE_CAP) break;
          if (hasSuppression(code, idx)) continue;

          const { text } = sliceAround(code, idx, 200, 5000);

          // Only analyze if first arg is inline object: updateMany({ where: ... })
          const argObj = extractInlineFirstArgObject(text);
          if (!argObj) continue;

          const whereBlock = extractWhereBlock(argObj);
          // If we can't confidently parse where, skip (no noise)
          if (!whereBlock) continue;

          if (whereHasTenantKey(whereBlock, tenantKeys)) continue;

          out.push({
            ruleId: "prisma-write-tenant-boundary",
            severity: c.severity,
            file: abs,
            ...firstLineCol(code, idx),
            message: `Prisma ${c.name}() is missing tenant/workspace/org keys in \`where\` (high-risk operation).`,
            fixHint:
              "For updateMany/deleteMany ensure `where` includes tenant/workspace/org constraints, or add `// vibecheck:tenant-ok` above if intentionally global.",
          });
          fileFindings++;
        }
      }
    }

    return out;
  },
};
