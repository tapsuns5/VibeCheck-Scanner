import type { Rule, Finding } from "../../engine/types.js";
import { rel, firstLineCol } from "../_shared.js";

export const viteClientEnvLeakRule: Rule = {
  id: "vite-client-env-leak",
  description: "Warn if non-VITE_ env vars are referenced in client code.",
  stack: ["vite", "auto"],
  async run(ctx) {
    const out: Finding[] = [];
    for (const abs of ctx.files) {
      const rp = rel(ctx, abs);
      if (!/\.(ts|tsx|js|jsx)$/.test(rp)) continue;

      const code = await ctx.readFile(abs);
      if (!code) continue;

      // Vite: import.meta.env.* is the typical pattern
      const m = code.match(/import\.meta\.env\.([A-Z0-9_]+)/);
      if (m && !m[1].startsWith("VITE_")) {
        const idx = code.indexOf(m[0]);
        out.push({
          ruleId: "vite-client-env-leak",
          severity: "info",
          file: abs,
          ...firstLineCol(code, idx),
          message: `Vite client code references ${m[0]}. Only VITE_* variables are exposed by default.`,
          fixHint:
            "If you intended this to be client-visible, rename to VITE_*; otherwise keep secrets on the server.",
        });
      }
    }
    return out;
  },
};
