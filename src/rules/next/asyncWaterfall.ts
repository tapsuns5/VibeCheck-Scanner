import ts from "typescript";
import type { Rule, Finding } from "../../engine/types.js";
import { rel } from "../_shared.js";

function isCodeFile(p: string) {
  return /\.(ts|tsx|js|jsx)$/.test(p);
}

// Reduce noise: skip Next.js route handlers by default
function isNextRouteHandler(relPath: string) {
  return (
    relPath.includes("/app/api/") && /\/route\.(ts|tsx|js|jsx)$/.test(relPath)
  );
}

function walk(node: ts.Node, cb: (n: ts.Node) => void) {
  cb(node);
  node.forEachChild((child) => walk(child, cb));
}

function isLoopStatement(n: ts.Node) {
  return (
    ts.isForStatement(n) ||
    ts.isForOfStatement(n) ||
    ts.isForInStatement(n) ||
    ts.isWhileStatement(n) ||
    ts.isDoStatement(n)
  );
}

/**
 * Finds the first `await` keyword inside `node` and returns its start position (character offset),
 * or null if none exist.
 */
function findFirstAwaitPos(node: ts.Node, sf: ts.SourceFile): number | null {
  let pos: number | null = null;
  walk(node, (n) => {
    if (pos != null) return;
    if (ts.isAwaitExpression(n)) {
      pos = n.getStart(sf);
    }
  });
  return pos;
}

/**
 * Detects `.forEach(async (...) => { await ... })` patterns (a common bug: async callback not awaited).
 * Returns the await position if found.
 */
function findAsyncForEachAwaitPos(sf: ts.SourceFile): number | null {
  let pos: number | null = null;

  walk(sf, (n) => {
    if (pos != null) return;

    // call expression like: something.forEach(...)
    if (!ts.isCallExpression(n)) return;

    // Callee should be a property access: x.forEach
    const expr = n.expression;
    if (!ts.isPropertyAccessExpression(expr)) return;
    if (expr.name.getText(sf) !== "forEach") return;

    // First arg should be a function
    const arg0 = n.arguments[0];
    if (!arg0) return;

    const isAsyncFn =
      (ts.isArrowFunction(arg0) || ts.isFunctionExpression(arg0)) &&
      (arg0.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ??
        false);

    if (!isAsyncFn) return;

    const body = (arg0 as ts.ArrowFunction | ts.FunctionExpression).body;
    const awaitPos = findFirstAwaitPos(body, sf);
    if (awaitPos != null) pos = awaitPos;
  });

  return pos;
}

function toLineCol(sf: ts.SourceFile, pos: number) {
  const lc = sf.getLineAndCharacterOfPosition(pos);
  return { line: lc.line + 1, col: lc.character + 1 };
}

export const nextAsyncWaterfallRule: Rule = {
  id: "next-async-waterfall",
  description:
    "Detect serial awaits inside loops (async waterfall) and async forEach footguns.",
  stack: ["nextjs", "auto"],

  async run(ctx) {
    const out: Finding[] = [];

    for (const abs of ctx.files) {
      const rp = rel(ctx, abs);
      if (!isCodeFile(rp)) continue;

      if (isNextRouteHandler(rp)) continue;

      const code = await ctx.readFile(abs);
      if (!code) continue;

      const scriptKind = rp.endsWith(".tsx")
        ? ts.ScriptKind.TSX
        : rp.endsWith(".jsx")
          ? ts.ScriptKind.JSX
          : rp.endsWith(".js")
            ? ts.ScriptKind.JS
            : ts.ScriptKind.TS;

      let sf: ts.SourceFile;
      try {
        sf = ts.createSourceFile(
          abs,
          code,
          ts.ScriptTarget.Latest,
          true,
          scriptKind,
        );
      } catch {
        // If parsing fails, don't guess with regex; just skip to avoid false positives.
        continue;
      }

      // 1) Flag: await inside actual loop statements (for/while/do)
      walk(sf, (n) => {
        if (!isLoopStatement(n)) return;

        // loop body:
        const body = ts.isForStatement(n)
          ? n.statement
          : ts.isForOfStatement(n)
            ? n.statement
            : ts.isForInStatement(n)
              ? n.statement
              : ts.isWhileStatement(n)
                ? n.statement
                : ts.isDoStatement(n)
                  ? n.statement
                  : null;

        if (!body) return;

        const awaitPos = findFirstAwaitPos(body, sf);
        if (awaitPos == null) return;

        const { line, col } = toLineCol(sf, awaitPos);
        out.push({
          ruleId: "next-async-waterfall",
          severity: "low",
          file: abs,
          line,
          col,
          message:
            "Possible async waterfall: `await` used inside a loop (serial awaits).",
          fixHint:
            "Collect promises and `await Promise.all(...)` when safe, or batch operations to avoid serial async work.",
        });
      });

      // 2) Flag: async forEach callback that awaits (common bug)
      const asyncForEachAwaitPos = findAsyncForEachAwaitPos(sf);
      if (asyncForEachAwaitPos != null) {
        const { line, col } = toLineCol(sf, asyncForEachAwaitPos);
        out.push({
          ruleId: "next-async-waterfall",
          severity: "low",
          file: abs,
          line,
          col,
          message:
            "Possible async waterfall/bug: `await` inside an `async` forEach callback (forEach does not await).",
          fixHint:
            "Use `for...of` with `await` (serial) or `Promise.all(items.map(...))` (parallel), depending on safety.",
        });
      }
    }

    return out;
  },
};
