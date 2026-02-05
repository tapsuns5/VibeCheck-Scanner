import type { Rule, Finding } from "../../engine/types.js";
import { rel, firstLineCol } from "../_shared.js";

function isClientComponent(code: string) {
  const head = code.slice(0, 250);
  
  // Check for explicit "use client" directive
  if (/(^|\n)\s*["']use client["']\s*;?\s*(\n|$)/.test(head)) {
    return true;
  }
  
  // Check for client-side imports and usage patterns
  const clientPatterns = [
    // React hooks
    /\buseState\b/,
    /\buseEffect\b/,
    /\buseCallback\b/,
    /\buseMemo\b/,
    /\buseRef\b/,
    /\buseContext\b/,
    /\buseReducer\b/,
    
    // Browser APIs
    /\bwindow\./,
    /\bdocument\./,
    /\blocalStorage\b/,
    /\bsessionStorage\b/,
    /\bnavigator\./,
    /\blocation\./,
    /\bfetch\(/,
    /\bXMLHttpRequest\b/,
    
    // Event handlers
    /\bonClick\b/,
    /\bonSubmit\b/,
    /\bonChange\b/,
    /\baddEventListener\b/,
    
    // Client-side imports
    /from\s+['"]react['"]/,
    /import.*from\s+['"]@\/.*['"]/,  // Local imports that might be client components
  ];
  
  return clientPatterns.some(pattern => pattern.test(code));
}

function isPascalCase(name: string): boolean {
  return typeof name === 'string' && /^[A-Z]/.test(name);
}

export const nextAsyncClientComponentRule: Rule = {
  id: "next-async-client-component",
  description: "Detects async client components, which are not allowed in React.",
  stack: ["nextjs", "vite", "auto"],

  async run(ctx) {
    const out: Finding[] = [];

    for (const abs of ctx.files) {
      const rp = rel(ctx, abs);
      if (!/\.(ts|tsx|js|jsx)$/.test(rp)) continue;

      const code = await ctx.readFile(abs);
      if (!code) continue;
      if (!isClientComponent(code)) continue;

      // Only flag async component declarations (PascalCase names)
      
      // Regex for async function declarations with PascalCase names (components)
      const functionDeclRe = /\basync\s+function\s+([A-Z]\w*)\s*\(/g;
      let m: RegExpExecArray | null;

      while ((m = functionDeclRe.exec(code))) {
        const name = m[1];
        const idx = m.index ?? 0;
        out.push({
          ruleId: "next-async-client-component",
          severity: "high",
          file: abs,
          ...firstLineCol(code, idx),
          message: `Async client component '${name}' detected. Client components cannot be async functions.`,
          fixHint: "Move async logic to useEffect, server components, or create a separate async function inside the component.",
        });
      }

      // Regex for const/let/var declarations with PascalCase names and async arrow functions (components)
      const arrowRe = /\b(?:const|let|var)\s+([A-Z]\w*)\s*=\s*async\s*\(/g;

      while ((m = arrowRe.exec(code))) {
        const name = m[1];
        const idx = m.index ?? 0;
        out.push({
          ruleId: "next-async-client-component",
          severity: "high",
          file: abs,
          ...firstLineCol(code, idx),
          message: `Async client component '${name}' detected. Client components cannot be async functions.`,
          fixHint: "Move async logic to useEffect, server components, or create a separate async function inside the component.",
        });
      }

      // Regex for export default async function (components)
      const exportDefaultAsyncRe = /\bexport\s+default\s+async\s+(?:function\s+([A-Z]\w*)\s*\(|function\s*\(|\()/g;

      while ((m = exportDefaultAsyncRe.exec(code))) {
        const name = m[1] || "default";
        const idx = m.index ?? 0;
        out.push({
          ruleId: "next-async-client-component",
          severity: "high",
          file: abs,
          ...firstLineCol(code, idx),
          message: `Async client component '${name}' detected. Client components cannot be async functions.`,
          fixHint: "Move async logic to useEffect, server components, or create a separate async function inside the component.",
        });
      }

      // Regex for export const/let/var with async and PascalCase (components)
      const exportNamedAsyncRe = /\bexport\s+(?:const|let|var)\s+([A-Z]\w*)\s*=\s*async\s*\(/g;

      while ((m = exportNamedAsyncRe.exec(code))) {
        const name = m[1];
        const idx = m.index ?? 0;
        out.push({
          ruleId: "next-async-client-component",
          severity: "high",
          file: abs,
          ...firstLineCol(code, idx),
          message: `Async client component '${name}' detected. Client components cannot be async functions.`,
          fixHint: "Move async logic to useEffect, server components, or create a separate async function inside the component.",
        });
      }
    }

    return out;
  },
};
