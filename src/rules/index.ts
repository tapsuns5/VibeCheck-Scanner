import type { Rule, StackName } from "../engine/types.js";

import { corsWildcardCredentialsRule } from "./security/corsWildcardCredentials.js";

import { nextClientEnvLeakRule } from "./next/clientEnvLeak.js";
import { nextServerOnlyImportInClientRule } from "./next/serverOnlyImportInClient.js";
import { nextApiAuthGuardRule } from "./next/apiAuthGuard.js";
import { nextMiddlewareMatcherCoverageRule } from "./next/middlewareMatcherCoverage.js";

import { viteClientEnvLeakRule } from "./vite/clientEnvLeak.js";

// import { nestControllerAuthGuardRule } from "./nest/controllerAuthGuard.js";

import { prismaMissingTenantFilterRule } from "./prisma/missingTenantFilter.js";
import { prismaWriteTenantBoundaryRule } from "./prisma/writeTenantBoundary.js";
import { nextHeavyClientImportsRule } from "./next/heavyClientImports.js";
import { nextAsyncWaterfallRule } from "./next/asyncWaterfall.js";

export const ALL_RULES: Rule[] = [
  corsWildcardCredentialsRule,

  // Next.js
  nextClientEnvLeakRule,
  nextServerOnlyImportInClientRule,
  nextApiAuthGuardRule,
  nextMiddlewareMatcherCoverageRule,
  nextHeavyClientImportsRule,
  nextAsyncWaterfallRule,

  // Vite
  viteClientEnvLeakRule,

  // Nest
  // nestControllerAuthGuardRule,

  // Prisma (shared)
  prismaMissingTenantFilterRule,
  prismaWriteTenantBoundaryRule,
];

export function rulesForStack(stack: StackName): Rule[] {
  return ALL_RULES.filter((r) => r.stack.includes(stack));
}
