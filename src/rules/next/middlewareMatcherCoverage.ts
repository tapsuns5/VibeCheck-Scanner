import type { Rule, Finding } from "../../engine/types.js";
import { rel, firstLineCol } from "../_shared.js";

export const nextMiddlewareMatcherCoverageRule: Rule = {
  id: "next-middleware-matcher-coverage",
  description: "Check that middleware matcher is defined (best-effort).",
  stack: ["nextjs", "auto"],
  async run(ctx) {
    const out: Finding[] = [];
    for (const abs of ctx.files) {
      const rp = rel(ctx, abs);
      if (!rp.endsWith("middleware.ts") && !rp.endsWith("middleware.js"))
        continue;

      const code = await ctx.readFile(abs);
      if (!code) continue;

      if (!code.includes("export const config") || !code.includes("matcher")) {
        out.push({
          ruleId: "next-middleware-matcher-coverage",
          severity: "med",
          file: abs,
          ...firstLineCol(code, 0),
          message:
            "middleware.ts does not appear to define export const config.matcher.",
          fixHint:
            "Review export const config.matcher and ensure protected route prefixes are included (or document why not).",
        });
      }
    }
    return out;
  },
};
