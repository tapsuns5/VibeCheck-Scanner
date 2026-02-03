import type { Rule, Finding } from "../../engine/types.js";
import { rel, firstLineCol } from "../_shared.js";

const SERVER_ONLY = [
  "server-only",
  "next/headers",
  "next/server",
  "fs",
  "node:fs",
  "node:crypto",
  "crypto",
];

export const nextServerOnlyImportInClientRule: Rule = {
  id: "next-server-only-import-in-client",
  description:
    "Warn when server-only modules are imported in client components.",
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

      for (const mod of SERVER_ONLY) {
        const needle1 = `from "${mod}"`;
        const needle2 = `from '${mod}'`;
        if (code.includes(needle1) || code.includes(needle2)) {
          const idx = code.indexOf(code.includes(needle1) ? needle1 : needle2);
          out.push({
            ruleId: "next-server-only-import-in-client",
            severity: "info",
            file: abs,
            ...firstLineCol(code, idx),
            message: `Client component imports a server-only module (${mod}).`,
            fixHint:
              "Move server-only logic to a server file (route handler / server action) and call it from the client.",
          });
          break;
        }
      }
    }
    return out;
  },
};
