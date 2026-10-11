import { checkDatabaseConnection } from "@aios/data";
import { z } from "zod";
import { getServerEnv, isDatabaseConfigured, isOwnerAccessConfigured, isPlatformSecurityConfigured, isRateLimitConfigured, isSupabaseConfigured } from "@/lib/config/env";
import { successResponse, withAuthenticatedApi } from "@/lib/api";

const readinessSchema = z.object({
  status: z.enum(["ready", "degraded"]),
  environment: z.enum(["local", "test", "preview", "production"]),
  checks: z.object({
    auth: z.boolean(),
    database: z.boolean(),
    apiRateLimit: z.boolean(),
    platformSecurity: z.boolean(),
  }),
});

async function readiness(requestId: string) {
  const env = getServerEnv();
  const databaseConfigured = isDatabaseConfigured();
  const database = databaseConfigured
    ? await Promise.race([
        checkDatabaseConnection(),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), 2_000)),
      ])
    : false;
  const checks = {
    auth: (isSupabaseConfigured() && (process.env.NODE_ENV !== "production" || isOwnerAccessConfigured()))
      || (env.AIOS_AUTH_BYPASS === "development-shell" && (process.env.NODE_ENV !== "production" || process.env.AIOS_DEMO_MODE === "true")),
    database,
    apiRateLimit: isRateLimitConfigured(),
    platformSecurity: isPlatformSecurityConfigured(),
  };
  const ready = Object.values(checks).every(Boolean);
  return successResponse(
    { status: ready ? "ready" : "degraded", environment: env.AIOS_ENVIRONMENT, checks },
    { status: ready ? 200 : 503, requestId, schema: readinessSchema },
  );
}

export const GET = withAuthenticatedApi(async (_request, context) => readiness(context.requestId));
export const OPTIONS = GET;
