// utils/discoverAuthGuards.ts
//
// Goal:
// - Discover auth guard function names from code (exported functions/consts, and common symbols).
// - Discover "public/proxy API route" hints from inline comments.
// - Merge user-configured allowlists from vibecheck.json (ctx.config.auth.*) on top.
// - Return a single DiscoveredAuth object that rules can consume.
//
// Inline hint examples (anywhere, but usually middleware / proxy / docs):
//   // vibecheck:public-api /api/health
//   // vibecheck:public-api-prefix /api/embed-proxy
//   // vibecheck:proxy-api-prefix /api/stripe/webhook

import type { RuleContext } from "../engine/types.js";
import { parseTs } from "./ast.js";
import { toPosix } from "./path.js";

/** Common guard-ish symbols across NextAuth/Clerk/custom stacks. */
const COMMON_GUARDS = [
  "getServerSession",
  "unstable_getServerSession",
  "auth",
  "currentUser",
  "requireAuth",
  "requireUser",
  "requireWorkspace",
  "requireAuthedWorkspace",
  "withWorkspace",
  "withFeatureFlag",
] as const;

export type DiscoveredAuth = {
  guards: string[];
  // API routes intentionally public (downgrade missing-guard findings)
  publicApiExact: string[]; // e.g. "/api/health"
  publicApiPrefix: string[]; // e.g. "/api/embed-proxy"
  // API routes that are proxies/webhooks (often public by design)
  proxyApiPrefix: string[]; // e.g. "/api/stripe/webhook", "/api/og"
};

function uniq(arr: string[]) {
  return [...new Set(arr.filter(Boolean))];
}

function normalizeApiPath(p: string): string {
  // Ensure leading slash, no trailing spaces.
  let s = String(p ?? "").trim();
  if (!s) return s;
  if (!s.startsWith("/")) s = "/" + s;
  // Optional: normalize accidental trailing slash (except root)
  if (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);
  return s;
}

/**
 * Discover guard symbols from a single file's code.
 * - Regex-based for speed/robustness
 * - parseTs() used only as a lightweight validation attempt (ignore failures)
 */
export function discoverAuthGuardsFromCode(code: string): string[] {
  const guards = new Set<string>();
  try {
    parseTs(code);
  } catch {
    // ignore parse errors; still do regex checks
  }

  const reFn = /export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/g;
  let m: RegExpExecArray | null;
  while ((m = reFn.exec(code))) {
    const name = m[1];
    if (!name) continue;
    if ((COMMON_GUARDS as readonly string[]).includes(name)) guards.add(name);
    if (/^require/i.test(name) || /^with/i.test(name)) guards.add(name);
  }

  const reConst = /export\s+const\s+([A-Za-z0-9_]+)\s*=/g;
  while ((m = reConst.exec(code))) {
    const name = m[1];
    if (!name) continue;
    if ((COMMON_GUARDS as readonly string[]).includes(name)) guards.add(name);
    if (/^require/i.test(name) || /^with/i.test(name)) guards.add(name);
  }

  // Broad symbol mention (helps when guards are re-exported/aliased)
  for (const g of COMMON_GUARDS) {
    if (code.includes(g)) guards.add(g);
  }

  return [...guards];
}

export function shouldScanFileForGuards(relPath: string): boolean {
  const p = toPosix(relPath);
  return (
    p.includes("/api/") ||
    p.includes("/auth") ||
    p.endsWith(".ts") ||
    p.endsWith(".tsx") ||
    p.endsWith(".js") ||
    p.endsWith(".jsx")
  );
}

/**
 * Parse inline hints. These are used to DOWNGRADE next-api-auth-guard findings to INFO.
 *
 * Supported:
 *   // vibecheck:public-api /api/health
 *   // vibecheck:public-api-prefix /api/embed-proxy
 *   // vibecheck:proxy-api-prefix /api/stripe/webhook
 */
function discoverPublicApiHints(code: string) {
  const publicApiExact: string[] = [];
  const publicApiPrefix: string[] = [];
  const proxyApiPrefix: string[] = [];

  const lines = code.split("\n");
  for (const line of lines) {
    // exact
    const m1 = line.match(/vibecheck:public-api\s+(\S+)/);
    if (m1?.[1]) publicApiExact.push(normalizeApiPath(m1[1]));

    // public prefix
    const m2 = line.match(/vibecheck:public-api-prefix\s+(\S+)/);
    if (m2?.[1]) publicApiPrefix.push(normalizeApiPath(m2[1]));

    // proxy prefix
    const m3 = line.match(/vibecheck:proxy-api-prefix\s+(\S+)/);
    if (m3?.[1]) proxyApiPrefix.push(normalizeApiPath(m3[1]));
  }

  return { publicApiExact, publicApiPrefix, proxyApiPrefix };
}

/**
 * Optional heuristic proxy-ish route prefixes (safe defaults).
 * These are NOT skipped—just downgraded to INFO when missing guard.
 *
 * NOTE: This can be reduced/removed once users configure auth.proxyApiPrefix.
 */
function inferProxyPrefixesFromPath(posixPath: string): string[] {
  const out: string[] = [];

  // Common intentionally-public/proxy patterns in Next.js apps
  if (posixPath.includes("/app/api/embed-proxy/")) out.push("/api/embed-proxy");
  if (posixPath.includes("/app/api/og/")) out.push("/api/og");
  if (posixPath.includes("/app/api/stripe/webhook/"))
    out.push("/api/stripe/webhook");
  if (posixPath.includes("/app/api/health/")) out.push("/api/health");
  if (posixPath.includes("/app/api/_debug/")) out.push("/api/_debug");

  return out.map(normalizeApiPath);
}

/**
 * Merge user config (vibecheck.json) into discovered results.
 *
 * Suggested user config shape:
 * {
 *   "auth": {
 *     "guards": ["getServerSession", "auth", "requireAuthedWorkspace"],
 *     "publicApiExact": ["/api/health"],
 *     "publicApiPrefix": ["/api/embed-proxy"],
 *     "proxyApiPrefix": ["/api/stripe/webhook", "/api/og"]
 *   }
 * }
 */
function mergeWithUserConfig(
  discovered: DiscoveredAuth,
  ctx: RuleContext,
): DiscoveredAuth {
  const cfgAuth = (ctx.config as any)?.auth ?? {};

  const cfgGuards = Array.isArray(cfgAuth.guards) ? cfgAuth.guards : [];
  const cfgPublicExact = Array.isArray(cfgAuth.publicApiExact)
    ? cfgAuth.publicApiExact
    : [];
  const cfgPublicPrefix = Array.isArray(cfgAuth.publicApiPrefix)
    ? cfgAuth.publicApiPrefix
    : [];
  const cfgProxyPrefix = Array.isArray(cfgAuth.proxyApiPrefix)
    ? cfgAuth.proxyApiPrefix
    : [];

  return {
    guards: uniq([
      ...discovered.guards,
      ...cfgGuards.map((s: any) => String(s).trim()).filter(Boolean),
    ]),
    publicApiExact: uniq([
      ...discovered.publicApiExact,
      ...cfgPublicExact.map((s: any) => normalizeApiPath(String(s))),
    ]),
    publicApiPrefix: uniq([
      ...discovered.publicApiPrefix,
      ...cfgPublicPrefix.map((s: any) => normalizeApiPath(String(s))),
    ]),
    proxyApiPrefix: uniq([
      ...discovered.proxyApiPrefix,
      ...cfgProxyPrefix.map((s: any) => normalizeApiPath(String(s))),
    ]),
  };
}

/**
 * Main discovery entrypoint. Run once in a prepass (runRules) and stash on config:
 *   (ctx.config as any).__discoveredAuth = await discoverAuthGuards(ctx)
 */
export async function discoverAuthGuards(
  ctx: RuleContext,
): Promise<DiscoveredAuth> {
  const guards = new Set<string>(COMMON_GUARDS as unknown as string[]);
  const publicApiExact: string[] = [];
  const publicApiPrefix: string[] = [];
  const proxyApiPrefix: string[] = [];

  // Iterate deterministically across ctx.files
  for (let i = 0; i < ctx.files.length; i++) {
    const abs = ctx.files[i];
    const rp = ctx.relPaths?.[i] ?? abs;
    const p = toPosix(rp);

    if (!/\.(ts|tsx|js|jsx)$/.test(p)) continue;
    if (!shouldScanFileForGuards(p)) continue;

    const code = await ctx.readFile(abs);
    if (!code) continue;

    // Discover guard symbols
    for (const g of discoverAuthGuardsFromCode(code)) guards.add(g);

    // Discover inline hints
    const hints = discoverPublicApiHints(code);
    publicApiExact.push(...hints.publicApiExact);
    publicApiPrefix.push(...hints.publicApiPrefix);
    proxyApiPrefix.push(...hints.proxyApiPrefix);

    // Infer proxy-ish prefixes based on file path (defaults)
    proxyApiPrefix.push(...inferProxyPrefixesFromPath(p));
  }

  const discovered: DiscoveredAuth = {
    guards: uniq([...guards]),
    publicApiExact: uniq(publicApiExact.map(normalizeApiPath)),
    publicApiPrefix: uniq(publicApiPrefix.map(normalizeApiPath)),
    proxyApiPrefix: uniq(proxyApiPrefix.map(normalizeApiPath)),
  };

  return mergeWithUserConfig(discovered, ctx);
}
