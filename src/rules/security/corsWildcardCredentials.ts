import type { Rule, Finding } from "../../engine/types.js";
import { rel, firstLineCol } from "../_shared.js";

/**
 * Heuristic:
 * - Access-Control-Allow-Origin: *
 * - AND Access-Control-Allow-Credentials: true
 * This combination is invalid and often indicates a security footgun.
 */
export const corsWildcardCredentialsRule: Rule = {
  id: "cors-wildcard-with-credentials",
  description:
    "Detect CORS config that uses wildcard origin with credentials=true.",
  stack: ["nextjs", "vite", "nestjs", "auto"],
  async run(ctx) {
    const out: Finding[] = [];
    for (const abs of ctx.files) {
      const rp = rel(ctx, abs);
      if (!/\.(ts|tsx|js|jsx)$/.test(rp)) continue;

      const code = await ctx.readFile(abs);
      if (!code) continue;

      const idxOrigin = code.indexOf("Access-Control-Allow-Origin");
      const idxCreds = code.indexOf("Access-Control-Allow-Credentials");

      const hasWildcard =
        idxOrigin >= 0 &&
        (code.includes("Access-Control-Allow-Origin: *") ||
          (code.includes("Access-Control-Allow-Origin", idxOrigin) &&
            (code.includes('"*"') || code.includes("'*'"))));

      const hasCreds =
        idxCreds >= 0 &&
        (code.includes("Access-Control-Allow-Credentials: true") ||
          (code.includes("Access-Control-Allow-Credentials", idxCreds) &&
            code.includes("true")));

      if (hasWildcard && hasCreds) {
        out.push({
          ruleId: "cors-wildcard-with-credentials",
          severity: "high",
          file: abs,
          ...firstLineCol(code, Math.max(0, idxOrigin)),
          message:
            "CORS appears to allow wildcard origin (*) while also allowing credentials=true.",
          fixHint:
            "If you need credentials, you must echo a specific Origin and add Vary: Origin. Avoid '*' with credentials.",
        });
      }
    }
    return out;
  },
};
