#!/usr/bin/env node
import { Command } from "commander";
import path from "node:path";
import { writeFile } from "node:fs/promises";

import type { CheckerConfig, OutputFormat, StackName } from "./engine/types.js";
import { discoverFiles } from "./scanner/discoverFiles.js";
import { detectRepo } from "./scanner/repoDetect.js";
import { getChangedFiles } from "./scanner/changedFiles.js";
import { readText } from "./utils/readText.js";
import { loadConfig } from "./engine/configLoader.js";
import { runRules } from "./engine/runRules.js";
import { printConsole, summarize, exitCode } from "./engine/report.js";
import {
  loadBaseline,
  writeBaseline,
  applyBaseline,
} from "./engine/baseline.js";
import { toSarif } from "./engine/sarif.js";
import { rulesForStack } from "./rules/index.js";
import { startStatusLine } from "./utils/status.js";

const program = new Command();

program
  .name("vibecheck")
  .description("Codebase checker CLI for Next.js / Vite / NestJS + Prisma")
  .version("0.3.0");

function parseStack(v: string) {
  const s = v.toLowerCase();
  if (s === "auto") return "auto";
  if (s === "nextjs") return "nextjs";
  if (s === "vite") return "vite";
  if (s === "nestjs" || s === "nest") return "nestjs";
  return "auto";
}

program
  .command("scan")
  .argument("[dir]", "repo root directory", ".")
  .option("--stack <stack>", "auto|nextjs|vite|nestjs", "auto")
  .option("--auth <auth>", "auto|nextauth|clerk|betterauth|custom|none", "auto")
  .option("--strict", "exit non-zero if blocker/high found", false)
  .option("--changed", "only scan files changed vs HEAD (best effort)", false)
  .option("--baseline <file>", "baseline file path", "")
  .option("--format <format>", "console|json|sarif", "console")
  .option("--out <file>", "write report to file (json/sarif)", "")
  .action(async (dir: string, opts: any) => {
    const rootDir = path.resolve(process.cwd(), dir);

    const status = startStatusLine({
      words: ["Running", "Scanning", "Vibing"],
      prefix: "",
    });

    const { repo, deps } = await detectRepo(rootDir);

    const cliOverride: Partial<CheckerConfig> = {
      stack: parseStack(opts.stack) as any,
      auth: opts.auth ?? "auto",
    } as any;

    const config = await loadConfig(rootDir, cliOverride, deps);

    const allFiles = await discoverFiles(rootDir, config);
    let files = allFiles;

    if (opts.changed) {
      const changed = await getChangedFiles(rootDir);
      if (changed && changed.length > 0) {
        const set = new Set(
          changed.map((p: string) => path.resolve(rootDir, p)),
        );
        files = allFiles.filter((f: string) => set.has(path.resolve(f)));
        if (files.length === 0) files = allFiles;
      }
    }

    const relPaths = files.map((f: string) =>
      f.startsWith(rootDir) ? f.slice(rootDir.length + 1) : f,
    );

    const stack: StackName =
      config.stack !== "auto" ? config.stack : (repo.stack as any);
    const rules = rulesForStack(stack);

    const ctx = {
      rootDir,
      files,
      relPaths,
      readFile: (p: string) => readText(p, config.maxFileBytes),
      config,
      repo: { ...repo, stack },
    };

    let findings = await runRules(ctx, rules);

    if (opts.baseline) {
      const baselinePath = path.resolve(process.cwd(), opts.baseline);
      const baseline = await loadBaseline(baselinePath);
      findings = applyBaseline(findings, baseline);
    }

    const format = (opts.format ?? "console") as OutputFormat;
    const summary = summarize(findings);

    status.stop("✅ Scan complete.");

    if (format === "json") {
      const payload = { rootDir, repo: ctx.repo, config, summary, findings };
      const out = JSON.stringify(payload, null, 2);
      if (opts.out)
        await writeFile(path.resolve(process.cwd(), opts.out), out, "utf8");
      else console.log(out);
    } else if (format === "sarif") {
      const sarif = toSarif(findings, rootDir);
      const out = JSON.stringify(sarif, null, 2);
      if (opts.out)
        await writeFile(path.resolve(process.cwd(), opts.out), out, "utf8");
      else console.log(out);
    } else {
      printConsole(findings);
      console.log(
        `Summary: blocker=${summary.blocker} high=${summary.high} med=${summary.med} low=${summary.low} info=${summary.info}`,
      );
    }

    process.exitCode = exitCode(findings, Boolean(opts.strict));
  });

program
  .command("baseline")
  .description("Baseline management")
  .command("init")
  .argument("[dir]", "repo root directory", ".")
  .option("--stack <stack>", "auto|nextjs|vite|nestjs", "auto")
  .option("--auth <auth>", "auto|nextauth|clerk|betterauth|custom|none", "auto")
  .option("--out <file>", "baseline output file", ".vibecheck-baseline.json")
  .action(async (dir: string, opts: any) => {
    const rootDir = path.resolve(process.cwd(), dir);
    const { repo, deps } = await detectRepo(rootDir);

    const cliOverride: Partial<CheckerConfig> = {
      stack: parseStack(opts.stack) as any,
      auth: opts.auth ?? "auto",
    } as any;

    const config = await loadConfig(rootDir, cliOverride, deps);
    const allFiles = await discoverFiles(rootDir, config);
    const stack: StackName =
      config.stack !== "auto" ? config.stack : (repo.stack as any);

    const ctx = {
      rootDir,
      files: allFiles,
      relPaths: allFiles.map((f: string) =>
        f.startsWith(rootDir) ? f.slice(rootDir.length + 1) : f,
      ),
      readFile: (p: string) => readText(p, config.maxFileBytes),
      config,
      repo: { ...repo, stack },
    };

    const rules = rulesForStack(stack);
    const findings = await runRules(ctx, rules);

    const outPath = path.resolve(process.cwd(), opts.out);
    await writeBaseline(outPath, findings);
    console.log(
      `Baseline written to ${outPath} (${findings.length} findings recorded).`,
    );
  });

program
  .command("ci")
  .description("CI-friendly scan (strict + changed files best-effort)")
  .argument("[dir]", "repo root directory", ".")
  .option("--stack <stack>", "auto|nextjs|vite|nestjs", "auto")
  .option("--auth <auth>", "auto|nextauth|clerk|betterauth|custom|none", "auto")
  .option("--baseline <file>", "baseline file path", ".vibecheck-baseline.json")
  .option("--format <format>", "console|json|sarif", "console")
  .option("--out <file>", "write report to file (json/sarif)", "")
  .action(async (dir: string, opts: any) => {
    const args = [
      "scan",
      dir,
      "--strict",
      "--changed",
      "--stack",
      opts.stack,
      "--auth",
      opts.auth,
      "--baseline",
      opts.baseline,
      "--format",
      opts.format,
    ];
    if (opts.out) args.push("--out", opts.out);

    console.log(`Tip: in CI, run: vibecheck ${args.join(" ")}`);
    console.log(
      `(This command exists mainly as a convenience wrapper for documentation.)`,
    );
  });

program.parse(process.argv);
