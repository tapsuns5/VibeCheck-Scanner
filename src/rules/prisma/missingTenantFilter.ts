import type { Rule, Finding } from "../../engine/types.js";
import { rel, firstLineCol } from "../_shared.js";

/**
 * prisma-missing-tenant-filter (signal-focused)
 *
 * Goals:
 * 1) Catch TRUE problems:
 *    - Prisma usage inside Client Components ("use client") => HIGH (should not happen)
 *
 * 2) Keep tenant-filter heuristics low-noise:
 *    - Only analyze server-ish areas by default (configurable)
 *    - Skip guessy parsing: only inline object literal args `{ ... }`
 *    - Default calls: findMany/findFirst (findUnique is commonly safe w/ post-checks)
 *    - Severity for heuristics: INFO (you can change to LOW if you prefer)
 *
 * Suppression:
 *   Add `// vibecheck:tenant-ok` near the callsite to suppress tenant heuristic.
 */

function isCodeFile(p: string) {
  return /\.(ts|tsx|js|jsx)$/.test(p);
}

function isClientComponent(code: string) {
  const head = code.slice(0, 300);
  return /(^|\n)\s*["']use client["']\s*;?\s*(\n|$)/.test(head);
}

function simplePathMatch(rp: string, patterns: string[]) {
  // intentionally simple substring-ish matching (no minimatch dep)
  return patterns.some((p) => {
    const token = p.replace(/\*\*/g, "").replace(/\*/g, "");
    return token && rp.includes(token);
  });
}

function findAllCallSites(code: string, callName: string): number[] {
  const idxs: number[] = [];
  const re = new RegExp(`\\.${callName}\\s*\\(`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) idxs.push(m.index);
  return idxs;
}

function sliceAround(code: string, idx: number, before = 150, after = 6000) {
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

export const prismaMissingTenantFilterRule: Rule = {
  id: "prisma-missing-tenant-filter",
  description:
    "Flags Prisma usage in client components (HIGH) and heuristically warns on server reads missing tenant filters (INFO).",
  stack: ["nextjs", "vite", "nestjs", "auto"],

  async run(ctx) {
    const out: Finding[] = [];

    const tenantKeys: string[] = (ctx.config as any)?.tenantKeys ?? [
      "workspaceId",
      "orgId",
      "tenantId",
      "accountId",
      "teamId",
    ];

    // Scan scope for tenant-filter heuristics (server-side patterns)
    const onlyPaths: string[] = (ctx.config as any)?.tenantReadOnlyPaths ?? [
      "app/api/",
      "lib/server/",
      "server/",
      "prisma/",
      // If you DO want server components outside api/lib/server, add:
      // "app/(protected)/",
      // "app/(server)/",
    ];

    const ignorePaths: string[] = (ctx.config as any)?.tenantReadIgnore ?? [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
    ];

    // Default calls (skipping findUnique to reduce false positives)
    const calls: string[] = (ctx.config as any)?.tenantReadCalls ?? [
      "findMany",
      "findFirst",
      // enable only if you really want it:
      // "findUnique",
    ];

    const FILE_CAP = 6;

    for (const abs of ctx.files) {
      const rp = rel(ctx, abs);
      if (!isCodeFile(rp)) continue;
      if (simplePathMatch(rp, ignorePaths)) continue;

      const code = await ctx.readFile(abs);
      if (!code) continue;

      // Quick path: if file doesn't mention prisma at all, skip everything
      if (!code.includes("prisma.")) continue;

      const client = isClientComponent(code);

      /**
       * 1) HARD RULE: Prisma in a client component is a real problem.
       *    We DO NOT skip client components — we flag them.
       */
      if (client) {
        // Find the first prisma.* call site as an anchor
        const idx = code.indexOf("prisma.");
        out.push({
          ruleId: "prisma-missing-tenant-filter",
          severity: "high",
          file: abs,
          ...firstLineCol(code, Math.max(0, idx)),
          message:
            'Client component ("use client") references Prisma. Prisma must never run/bundle in client-side code.',
          fixHint:
            "Move Prisma calls into a Route Handler (app/api/*), Server Action, or a server-only module (lib/server/*). Client should call the server via fetch/action.",
        });
        // Don't also emit tenant heuristics for this file; the client issue is the only thing that matters here.
        continue;
      }

      /**
       * 2) SOFT RULE: Tenant filter heuristics ONLY on server-ish paths.
       *    This avoids spamming server components/routes you don't want to police.
       */
      if (onlyPaths?.length && !simplePathMatch(rp, onlyPaths)) {
        continue;
      }

      let fileFindings = 0;

      for (const c of calls) {
        if (fileFindings >= FILE_CAP) break;

        const idxs = findAllCallSites(code, c);

        for (const idx of idxs) {
          if (fileFindings >= FILE_CAP) break;
          if (hasSuppression(code, idx)) continue;

          const { text } = sliceAround(code, idx, 150, 6000);

          const argObj = extractInlineFirstArgObject(text);
          if (!argObj) continue;

          const whereBlock = extractWhereBlock(argObj);
          if (!whereBlock) continue;

          if (whereHasTenantKey(whereBlock, tenantKeys)) continue;

          out.push({
            ruleId: "prisma-missing-tenant-filter",
            severity: "info",
            file: abs,
            ...firstLineCol(code, idx),
            message: `Prisma ${c}() has a where: but does not mention tenant/workspace/org constraints (heuristic).`,
            fixHint:
              "If this is multi-tenant data, add tenant/workspace/org keys to `where`, enforce via middleware, or suppress with `// vibecheck:tenant-ok` if safe by design.",
          });

          fileFindings++;
        }
      }
    }

    return out;
  },
};
