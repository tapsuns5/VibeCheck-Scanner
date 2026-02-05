import type { Rule, Finding } from "../../engine/types.js";
import { rel, firstLineCol } from "../_shared.js";

function isClientComponent(code: string) {
  const head = code.slice(0, 250);
  return /(^|\n)\s*["']use client["']\s*;?\s*(\n|$)/.test(head);
}

function isClientSideFile(filePath: string) {
  // Check if file is likely client-side based on path patterns
  const clientPatterns = [
    /\/pages\//,  // Next.js pages directory
    /\/components\//,  // Component directories
    /\/src\/components\//,
    /\/app\//,  // Next.js app directory (could be client or server)
    /\/client\//,  // Explicit client directories
    /\.client\./,  // Files with .client. in name
  ];

  return clientPatterns.some(pattern => pattern.test(filePath));
}

export const supabaseServiceRoleKeyRule: Rule = {
  id: "supabase-service-role-key",
  description:
    "Detects exposure of Supabase service role keys in client-side code.",
  stack: ["nextjs", "vite", "nestjs", "auto"],

  async run(ctx) {
    const out: Finding[] = [];

    for (const abs of ctx.files) {
      const rp = rel(ctx, abs);

      // Check JavaScript/TypeScript files
      if (!/\.(ts|tsx|js|jsx)$/.test(rp)) continue;

      const code = await ctx.readFile(abs);
      if (!code) continue;

      // Check for service role key patterns
      const serviceKeyPatterns = [
        // Direct references to service role key variables
        /\bSUPABASE_SERVICE_ROLE_KEY\b/g,
        /\bSUPABASE_SERVICE_KEY\b/g,
        /\bSERVICE_ROLE_KEY\b/g,

        // Environment variable access patterns
        /process\.env\.SUPABASE_SERVICE_ROLE_KEY/g,
        /process\.env\.SUPABASE_SERVICE_KEY/g,
        /process\.env\.SERVICE_ROLE_KEY/g,

        // Vite-style env access
        /import\.meta\.env\.VITE_SUPABASE_SERVICE_ROLE_KEY/g,
        /import\.meta\.env\.VITE_SUPABASE_SERVICE_KEY/g,

        // Common misspellings or variations
        /\bSERVICE_ROLE\b/g,
        /\bSUPABASE_SERVICE\b/g,
      ];

      let foundServiceKeyUsage = false;
      let severity: "blocker" | "high" = "high";
      let message = "";
      let fixHint = "";

      for (const pattern of serviceKeyPatterns) {
        const matches = code.match(pattern);
        if (matches) {
          for (const match of matches) {
            const index = code.indexOf(match);

            // Determine if this is client-side code
            const isClientCode = isClientComponent(code) || isClientSideFile(rp);

            if (isClientCode) {
              severity = "blocker";
              message = `Service role key '${match}' detected in client-side code. This is a critical security vulnerability.`;
              fixHint = "Service role keys must NEVER be exposed to the client. Move all service role operations to server-side code (API routes, server actions, server components).";
            } else {
              // Even in server-side code, flag direct usage of service role keys
              severity = "high";
              message = `Service role key '${match}' usage detected. Ensure this is only used in secure server-side contexts.`;
              fixHint = "Service role keys bypass RLS and should be used cautiously. Consider using anon keys with proper RLS policies instead.";
            }

            foundServiceKeyUsage = true;

            out.push({
              ruleId: "supabase-service-role-key",
              severity,
              file: abs,
              ...firstLineCol(code, index),
              message,
              fixHint,
            });

            // Limit to 3 findings per file to avoid spam
            if (out.filter(f => f.file === abs && f.ruleId === "supabase-service-role-key").length >= 3) {
              break;
            }
          }
        }
      }

      // Additional check: look for createClient calls with service role patterns
      if (!foundServiceKeyUsage) {
        const createClientMatches = code.match(/createClient\s*\(\s*[^,]+,\s*([^)]+)/g);
        if (createClientMatches) {
          for (const match of createClientMatches) {
            // Extract the key parameter
            const keyMatch = match.match(/createClient\s*\(\s*[^,]+,\s*([^)]+)/);
            if (keyMatch && keyMatch[1]) {
              const keyParam = keyMatch[1].trim();

              // Check if key parameter contains service role patterns
              if (serviceKeyPatterns.some(pattern => pattern.test(keyParam))) {
                const index = code.indexOf(match);

                out.push({
                  ruleId: "supabase-service-role-key",
                  severity: "high",
                  file: abs,
                  ...firstLineCol(code, index),
                  message: "Potential service role key usage in createClient call.",
                  fixHint: "Verify that this key is not a service role key. Service role keys should never be used in client-side createClient calls.",
                });
              }
            }
          }
        }
      }
    }

    return out;
  },
};
