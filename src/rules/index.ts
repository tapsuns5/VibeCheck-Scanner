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
import { supabaseClientUsageRule } from "./supabase/clientUsage.js";
import { supabaseFundamentalsRule } from "./supabase/fundamentals.js";
import { supabaseRLSValidationRule } from "./supabase/rlsValidation.js";
import { supabaseServiceRoleKeyRule } from "./supabase/serviceRoleKey.js";
import { nextHeavyClientImportsRule } from "./next/heavyClientImports.js";
import { nextAsyncWaterfallRule } from "./next/asyncWaterfall.js";
import { nextAsyncClientComponentRule } from "./next/asyncClientComponent.js";

export const ALL_RULES: Rule[] = [
  corsWildcardCredentialsRule,

  // Next.js
  nextClientEnvLeakRule,
  nextServerOnlyImportInClientRule,
  nextApiAuthGuardRule,
  nextMiddlewareMatcherCoverageRule,
  nextHeavyClientImportsRule,
  nextAsyncWaterfallRule,
  nextAsyncClientComponentRule,

  // Vite
  viteClientEnvLeakRule,

  // Nest
  // nestControllerAuthGuardRule,

  // Prisma (shared)
  prismaMissingTenantFilterRule,
  prismaWriteTenantBoundaryRule,

  // Supabase
  supabaseClientUsageRule,
  supabaseFundamentalsRule,
  supabaseRLSValidationRule,
  supabaseServiceRoleKeyRule,
];

export function rulesForStack(stack: StackName): Rule[] {
  return ALL_RULES.filter((r) => r.stack.includes(stack));
}
