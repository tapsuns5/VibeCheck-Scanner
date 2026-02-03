import type { Rule, Finding } from "../../engine/types.js";
import { rel, firstLineCol } from "../_shared.js";

function isClientComponent(code: string) {
  const head = code.slice(0, 250);
  return /(^|\n)\s*["']use client["']\s*;?\s*(\n|$)/.test(head);
}

export const nextClientEnvLeakRule: Rule = {
  id: "next-client-env-leak",
  description:
    "Client component references process.env (only warns on non-NEXT_PUBLIC env vars).",
  stack: ["nextjs", "auto"],

  async run(ctx) {
    const out: Finding[] = [];

    for (const abs of ctx.files) {
      const rp = rel(ctx, abs);
      if (!/\.(ts|tsx|js|jsx)$/.test(rp)) continue;

      const code = await ctx.readFile(abs);
      if (!code) continue;
      if (!isClientComponent(code)) continue;

      // Find process.env.SOMETHING occurrences
      const re = /\bprocess\.env\.([A-Z0-9_]+)\b/g;
      let m: RegExpExecArray | null;

      while ((m = re.exec(code))) {
        const varName = m[1] ?? "";

        // Allowed in browser:
        // - NODE_ENV
        // - NEXT_PUBLIC_*
        if (varName === "NODE_ENV") continue;
        if (varName.startsWith("NEXT_PUBLIC_")) continue;

        const idx = m.index ?? 0;
        out.push({
          ruleId: "next-client-env-leak",
          severity: "info",
          file: abs,
          ...firstLineCol(code, idx),
          message: `Client component references process.env.${varName}. This may expose a secret if not public.`,
          fixHint:
            "If this is truly safe, rename to NEXT_PUBLIC_* or move the lookup server-side and pass a safe value to the client.",
        });

        // Keep noise low: cap to 3 per file
        if (
          out.filter(
            (f) => f.file === abs && f.ruleId === "next-client-env-leak",
          ).length >= 3
        ) {
          break;
        }
      }
    }

    return out;
  },
};
