import type { Rule, RuleContext, Finding } from "./types.js";
import { discoverAuthGuards } from "../utils/discoverAuthGuards.js";

export async function runRules(
  ctx: RuleContext,
  rules: Rule[],
): Promise<Finding[]> {
  const out: Finding[] = [];

  // --- Prepass: discover auth guard signals once (shared across rules) ---
  // Scans repo files via ctx.files + ctx.readFile, then stashes results on config.
  try {
    const discovered = await discoverAuthGuards(ctx);
    (ctx.config as any).__discoveredAuth = discovered ?? {};
  } catch (e: any) {
    out.push({
      ruleId: "discover-auth-guards",
      severity: "info",
      message: `Auth discovery failed: ${String(e?.message ?? e)}`,
      file: ctx.rootDir,
    });
    (ctx.config as any).__discoveredAuth = {};
  }

  // --- Run rules ---
  for (const rule of rules) {
    if (!rule.stack.includes("auto") && !rule.stack.includes(ctx.repo.stack))
      continue;

    const findings = await rule.run(ctx).catch((e: any) => {
      return [
        {
          ruleId: rule.id,
          severity: "info",
          message: `Rule crashed: ${String(e?.message ?? e)}`,
          file: ctx.rootDir,
        },
      ] satisfies Finding[];
    });

    out.push(...findings);
  }

  return out;
}
