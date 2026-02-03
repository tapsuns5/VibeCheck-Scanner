import type { Rule, Finding } from "../../engine/types.js";
import { rel, firstLineCol } from "../_shared.js";

const HEAVY = ["aws-sdk", "puppeteer", "playwright", "@prisma/client"];

export const nextHeavyClientImportsRule: Rule = {
  id: "next-heavy-client-imports",
  description: "Warn when heavy deps are imported in client components.",
  stack: ["nextjs", "auto"],
  async run(ctx) {
    const out: Finding[] = [];
    for (const abs of ctx.files) {
      const rp = rel(ctx, abs);
      if (!/\.(ts|tsx|js|jsx)$/.test(rp)) continue;

      const code = await ctx.readFile(abs);
      if (!code) continue;

      if (!code.includes('"use client"') && !code.includes("'use client'"))
        continue;

      for (const mod of HEAVY) {
        if (code.includes(`from "${mod}"`) || code.includes(`from '${mod}'`)) {
          const idx = code.indexOf(mod);
          out.push({
            ruleId: "next-heavy-client-imports",
            severity: "info",
            file: abs,
            ...firstLineCol(code, idx),
            message: `Client component imports potentially heavy dependency: ${mod}.`,
            fixHint:
              "Consider moving this import to the server or dynamically importing it where needed.",
          });
        }
      }
    }
    return out;
  },
};
