import type { Rule, Finding } from "../../engine/types.js";
import { rel, firstLineCol } from "../_shared.js";

export const supabaseRLSValidationRule: Rule = {
  id: "supabase-rls-validation",
  description:
    "Checks that Row Level Security is properly enabled on database tables.",
  stack: ["nextjs", "vite", "nestjs", "auto"],

  async run(ctx) {
    const out: Finding[] = [];

    for (const abs of ctx.files) {
      const rp = rel(ctx, abs);

      // Check SQL files, migration files, and schema files
      if (!/\.(sql|prisma)$/.test(rp)) continue;

      const content = await ctx.readFile(abs);
      if (!content) continue;

      // Find all CREATE TABLE statements
      const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(\w+)["`]?\s*\(/gi;
      const tables: string[] = [];
      let match;

      while ((match = createTableRegex.exec(content)) !== null) {
        const tableName = match[1];
        if (tableName && !tables.includes(tableName)) {
          tables.push(tableName);
        }
      }

      // Also check for ALTER TABLE statements that might be creating tables
      const alterTableRegex = /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?["`]?(\w+)["`]?\s+/gi;
      while ((match = alterTableRegex.exec(content)) !== null) {
        const tableName = match[1];
        if (tableName && !tables.includes(tableName)) {
          tables.push(tableName);
        }
      }

      // Check each table for RLS enablement
      for (const tableName of tables) {
        const rlsEnabledRegex = new RegExp(
          `ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?["\`]?${tableName}["\`]?\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
          'gi'
        );

        if (!rlsEnabledRegex.test(content)) {
          // Find the CREATE TABLE statement position for this table
          const tableRegex = new RegExp(
            `CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?["\`]?${tableName}["\`]?\\s*\\(`,
            'gi'
          );
          const tableMatch = tableRegex.exec(content);

          if (tableMatch) {
            out.push({
              ruleId: "supabase-rls-validation",
              severity: "high",
              file: abs,
              ...firstLineCol(content, tableMatch.index),
              message: `Table '${tableName}' does not have Row Level Security enabled. This may expose sensitive data.`,
              fixHint: `Add 'ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;' and create appropriate RLS policies using auth.uid() and auth.jwt().`,
            });
          }
        }
      }

      // Also check for tables that might be accessed without RLS policies
      // Look for potential user data tables (common patterns)
      const userDataPatterns = [
        /users?/i,
        /profiles?/i,
        /accounts?/i,
        /customers?/i,
        /members?/i,
        /auth/i,
        /sessions?/i,
      ];

      for (const tableName of tables) {
        const isUserDataTable = userDataPatterns.some(pattern => pattern.test(tableName));

        if (isUserDataTable) {
          const rlsEnabledRegex = new RegExp(
            `ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?["\`]?${tableName}["\`]?\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
            'gi'
          );

          if (!rlsEnabledRegex.test(content)) {
            const tableRegex = new RegExp(
              `CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?["\`]?${tableName}["\`]?\\s*\\(`,
              'gi'
            );
            const tableMatch = tableRegex.exec(content);

            if (tableMatch) {
              out.push({
                ruleId: "supabase-rls-validation",
                severity: "blocker",
                file: abs,
                ...firstLineCol(content, tableMatch.index),
                message: `User data table '${tableName}' does not have Row Level Security enabled. This is a critical security vulnerability.`,
                fixHint: `Immediately enable RLS with 'ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;' and create policies restricting access to authenticated users only.`,
              });
            }
          }
        }
      }
    }

    return out;
  },
};
