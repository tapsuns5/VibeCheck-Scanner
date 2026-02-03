import type { Rule, Finding } from "../../engine/types.js";
import { rel, isNextApiRoute, firstLineCol } from "../_shared.js";

function toRoutePathFromRelPath(rp: string): string {
  // rp example: app/api/health/route.ts
  // want: /api/health
  const cleaned = rp.replaceAll("\\", "/");
  const idx = cleaned.indexOf("app/api/");
  if (idx < 0) return "";
  const after = cleaned.slice(idx + "app/api/".length);

  // remove trailing /route.ts(x|js|jsx)
  const noRouteFile = after.replace(/\/route\.(ts|tsx|js|jsx)$/, "");

  // turn dynamic segments [id] -> :id (best-effort)
  const routeish = noRouteFile.replace(/\[([^\]]+)\]/g, ":$1");

  return "/api/" + routeish;
}

function matchesExactOrPrefix(
  routePath: string,
  exact: string[],
  prefixes: string[],
): boolean {
  if (!routePath) return false;
  if (exact.some((e) => e === routePath)) return true;
  if (prefixes.some((p) => routePath.startsWith(p))) return true;
  return false;
}

export const nextApiAuthGuardRule: Rule = {
  id: "next-api-auth-guard",
  description: "Ensure API routes call an auth guard early.",
  stack: ["nextjs", "auto"],
  async run(ctx) {
    const out: Finding[] = [];

    const discovered = (ctx.config as any).__discoveredAuth ?? {};
    const discoveredGuards: string[] = Array.isArray(discovered.guards)
      ? discovered.guards
      : [];

    const guards = ctx.config.authGuards?.length
      ? ctx.config.authGuards
      : discoveredGuards.length
        ? discoveredGuards
        : ["getServerSession", "auth"];

    const publicApiExact: string[] = Array.isArray(discovered.publicApiExact)
      ? discovered.publicApiExact
      : [];
    const publicApiPrefix: string[] = Array.isArray(discovered.publicApiPrefix)
      ? discovered.publicApiPrefix
      : [];
    const proxyApiPrefix: string[] = Array.isArray(discovered.proxyApiPrefix)
      ? discovered.proxyApiPrefix
      : [];

    for (const abs of ctx.files) {
      const rp = rel(ctx, abs);
      if (!isNextApiRoute(rp)) continue;

      const code = await ctx.readFile(abs);
      if (!code) continue;

      const routePath = toRoutePathFromRelPath(rp);

      // Explicit per-file suppress = totally skip
      if (code.includes("vibecheck:public")) continue;

      // does it call any auth guard?
      const hasGuard = guards.some(
        (g) => code.includes(g + "(") || code.includes(g + " ("),
      );
      if (hasGuard) continue;

      // Downgrade to INFO for routes that are intentionally public/proxy-ish.
      const isPublicByDiscovery = matchesExactOrPrefix(
        routePath,
        publicApiExact,
        publicApiPrefix,
      );

      const isProxyishByDiscovery =
        routePath && proxyApiPrefix.some((p) => routePath.startsWith(p));

      const severity =
        isPublicByDiscovery || isProxyishByDiscovery ? "info" : "high";

      const extra =
        severity === "info"
          ? " (appears intentionally public/proxy; verify this is intended)"
          : "";

      out.push({
        ruleId: "next-api-auth-guard",
        severity,
        file: abs,
        ...firstLineCol(code, 0),
        message:
          "API route appears to lack an auth guard call." +
          extra +
          ' If it is intentionally public, add comment "vibecheck:public".',
        fixHint: `Call your auth guard early (e.g., ${guards
          .slice(0, 3)
          .join(
            ", ",
          )}) and enforce role/tenant checks before DB access. If intentionally public/proxy, consider adding "vibecheck:public" or a middleware hint (vibecheck:public-api / vibecheck:public-api-prefix).`,
      });
    }

    return out;
  },
};
