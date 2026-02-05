import type { Rule, Finding } from "../../engine/types.js";
import { rel, firstLineCol } from "../_shared.js";

function isClientComponent(code: string) {
  const head = code.slice(0, 250);
  return /(^|\n)\s*["']use client["']\s*;?\s*(\n|$)/.test(head);
}

function hasSupabaseImport(code: string) {
  // Check for various Supabase import patterns
  const patterns = [
    /from\s+['"]@supabase\/supabase-js['"]/,
    /import\s+.*\s+from\s+['"]@supabase\/supabase-js['"]/,
    /import\s+['"]@supabase\/supabase-js['"]/,
    /require\s*\(\s*['"]@supabase\/supabase-js['"]\s*\)/,
  ];

  return patterns.some(pattern => pattern.test(code));
}

function hasSupabaseClientUsage(code: string) {
  // Check for supabase client instantiation or usage
  const patterns = [
    /createClient\s*\(/,
    /supabase\s*\./,
    /supabase\(/,
  ];

  return patterns.some(pattern => pattern.test(code));
}

export const supabaseClientUsageRule: Rule = {
  id: "supabase-client-usage",
  description:
    "Supabase client should only be used in server-side code, not in 'use client' components.",
  stack: ["nextjs", "auto"],

  async run(ctx) {
    const out: Finding[] = [];

    for (const abs of ctx.files) {
      const rp = rel(ctx, abs);
      if (!/\.(ts|tsx|js|jsx)$/.test(rp)) continue;

      const code = await ctx.readFile(abs);
      if (!code) continue;
      if (!isClientComponent(code)) continue;

      // Check if file imports or uses Supabase
      const hasImport = hasSupabaseImport(code);
      const hasUsage = hasSupabaseClientUsage(code);

      if (hasImport || hasUsage) {
        // Find the position of the import or usage
        let idx = 0;
        if (hasImport) {
          const importMatch = code.match(/from\s+['"]@supabase\/supabase-js['"]/);
          if (importMatch) {
            idx = importMatch.index ?? 0;
          }
        } else if (hasUsage) {
          const usageMatch = code.match(/(createClient|supabase\s*\.)/);
          if (usageMatch) {
            idx = usageMatch.index ?? 0;
          }
        }

        out.push({
          ruleId: "supabase-client-usage",
          severity: "high",
          file: abs,
          ...firstLineCol(code, idx),
          message: "Supabase client usage detected in 'use client' component. This may expose sensitive operations to the browser.",
          fixHint: "Move Supabase operations to server components, API routes, or server actions. Pass only safe data to client components.",
        });
      }
    }

    return out;
  },
};
