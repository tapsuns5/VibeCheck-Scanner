export type Severity = "blocker" | "high" | "med" | "low" | "info";
export type StackName = "auto" | "nextjs" | "vite" | "nestjs";
export type AuthKind = "auto" | "nextauth" | "clerk" | "betterauth" | "custom" | "none";
export type OutputFormat = "console" | "json" | "sarif";

export interface CheckerConfig {
  stack: StackName;
  auth: AuthKind;
  authGuards: string[];
  ignore: string[];
  maxFileBytes: number;
}

export interface RepoDetectResult {
  rootDir: string;
  stack: StackName;
}

export interface Finding {
  ruleId: string;
  severity: Severity;
  message: string;
  file: string;
  line?: number;
  col?: number;
  fixHint?: string;
}

export interface RuleContext {
  rootDir: string;
  files: string[];
  relPaths: string[];
  readFile: (absPath: string) => Promise<string>;
  config: CheckerConfig;
  repo: { stack: StackName };
}

export interface Rule {
  id: string;
  description: string;
  stack: StackName[];
  run: (ctx: RuleContext) => Promise<Finding[]>;
}
