import type { Rule, Finding } from "../../engine/types.js";
import { rel, firstLineCol } from "../_shared.js";

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

function findSupabaseClientCreation(code: string) {
  // Find createClient calls
  const createClientRegex = /createClient\s*\(\s*([^,]+),\s*([^,)]+)/g;
  const matches = [];
  let match;

  while ((match = createClientRegex.exec(code)) !== null) {
    matches.push({
      index: match.index,
      url: match[1]?.trim(),
      key: match[2]?.trim(),
    });
  }

  return matches;
}

export const supabaseFundamentalsRule: Rule = {
  id: "supabase-fundamentals",
  description:
    "Checks for proper Supabase client setup and security fundamentals.",
  stack: ["nextjs", "vite", "nestjs", "auto"],

  async run(ctx) {
    const out: Finding[] = [];

    for (const abs of ctx.files) {
      const rp = rel(ctx, abs);
      if (!/\.(ts|tsx|js|jsx)$/.test(rp)) continue;

      const code = await ctx.readFile(abs);
      if (!code) continue;

      if (!hasSupabaseImport(code)) continue;

      // Check for createClient calls
      const clientCreations = findSupabaseClientCreation(code);

      for (const creation of clientCreations) {
        const { index, url, key } = creation;

        // Check if URL is from environment variables
        if (!url.includes('process.env') && !url.includes('import.meta.env')) {
          out.push({
            ruleId: "supabase-fundamentals",
            severity: "high",
            file: abs,
            ...firstLineCol(code, index),
            message: "Supabase URL should be loaded from environment variables, not hardcoded.",
            fixHint: "Use process.env.SUPABASE_URL or import.meta.env.VITE_SUPABASE_URL instead of hardcoded values.",
          });
        }

        // Check if anon key is from environment variables
        if (!key.includes('process.env') && !key.includes('import.meta.env')) {
          out.push({
            ruleId: "supabase-fundamentals",
            severity: "high",
            file: abs,
            ...firstLineCol(code, index),
            message: "Supabase anon key should be loaded from environment variables, not hardcoded.",
            fixHint: "Use process.env.SUPABASE_ANON_KEY or import.meta.env.VITE_SUPABASE_ANON_KEY instead of hardcoded values.",
          });
        }
      }

      // Check for service role key usage in client-side code
      const serviceRoleRegex = /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SERVICE_KEY/;
      if (serviceRoleRegex.test(code)) {
        const match = code.match(serviceRoleRegex);
        if (match) {
          out.push({
            ruleId: "supabase-fundamentals",
            severity: "blocker",
            file: abs,
            ...firstLineCol(code, match.index ?? 0),
            message: "Service role key detected. This should never be used in client-side code.",
            fixHint: "Service role keys should only be used in server-side code (API routes, server components, server actions).",
          });
        }
      }
    }

    return out;
  },
};
