import "server-only";
import { z } from "zod";
import { getPublicEnv, isSupabaseConfigured, type PublicEnv } from "./public-env";

const serverEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1).optional(),
  DIRECT_URL: z.string().min(1).optional(),
  SUPABASE_SERVICE_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  APPLICATION_ENCRYPTION_KEY: z.string().min(32).optional(),
  WEBHOOK_SIGNING_SECRET: z.string().min(32).optional(),
  GOOGLE_GMAIL_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_GMAIL_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_GMAIL_REDIRECT_URI: z.string().url().optional(),
  GMAIL_OAUTH_STATE_SECRET: z.string().min(32).optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  AIOS_RATE_LIMIT_BACKEND: z.enum(["memory", "upstash"]).default(process.env.NODE_ENV === "production" ? "upstash" : "memory"),
  AIOS_OWNER_EMAIL: z.string().email().optional(),
  AIOS_ENVIRONMENT: z.enum(["local", "test", "preview", "production"]).default("local"),
  AIOS_AUTH_BYPASS: z.string().optional(),
  AIOS_CORS_ORIGINS: z.string().default("http://localhost:3000"),
  SENTRY_DSN: z.string().url().optional(),
  AXIOM_DATASET: z.string().optional(),
  AXIOM_TOKEN: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export { getPublicEnv, isSupabaseConfigured, type PublicEnv };

let cachedServer: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (!cachedServer) {
    cachedServer = serverEnvSchema.parse({
      ...getPublicEnv(),
      DATABASE_URL: process.env.DATABASE_URL,
      DIRECT_URL: process.env.DIRECT_URL,
      SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      APPLICATION_ENCRYPTION_KEY: process.env.APPLICATION_ENCRYPTION_KEY,
      WEBHOOK_SIGNING_SECRET: process.env.WEBHOOK_SIGNING_SECRET,
      GOOGLE_GMAIL_CLIENT_ID: process.env.GOOGLE_GMAIL_CLIENT_ID,
      GOOGLE_GMAIL_CLIENT_SECRET: process.env.GOOGLE_GMAIL_CLIENT_SECRET,
      GOOGLE_GMAIL_REDIRECT_URI: process.env.GOOGLE_GMAIL_REDIRECT_URI,
      GMAIL_OAUTH_STATE_SECRET: process.env.GMAIL_OAUTH_STATE_SECRET,
      UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
      UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
      AIOS_RATE_LIMIT_BACKEND: process.env.AIOS_RATE_LIMIT_BACKEND,
      AIOS_OWNER_EMAIL: process.env.AIOS_OWNER_EMAIL,
      AIOS_ENVIRONMENT: process.env.AIOS_ENVIRONMENT,
      AIOS_AUTH_BYPASS: process.env.AIOS_AUTH_BYPASS,
      AIOS_CORS_ORIGINS: process.env.AIOS_CORS_ORIGINS,
      SENTRY_DSN: process.env.SENTRY_DSN,
      AXIOM_DATASET: process.env.AXIOM_DATASET,
      AXIOM_TOKEN: process.env.AXIOM_TOKEN,
    });
  }
  return cachedServer;
}

export function isRateLimitConfigured(): boolean {
  const env = getServerEnv();
  return env.AIOS_RATE_LIMIT_BACKEND === "memory" || Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
}

export function isOwnerAccessConfigured(): boolean {
  const env = getServerEnv();
  return Boolean(env.AIOS_OWNER_EMAIL);
}

export function isDatabaseConfigured(): boolean {
  return Boolean(getServerEnv().DATABASE_URL);
}

export function isMigrationDatabaseConfigured(): boolean {
  return Boolean(getServerEnv().DIRECT_URL);
}

export function isPlatformSecurityConfigured(): boolean {
  const env = getServerEnv();
  return Boolean(env.APPLICATION_ENCRYPTION_KEY && env.WEBHOOK_SIGNING_SECRET);
}

export function isGmailConfigured(): boolean {
  const env = getServerEnv();
  return Boolean(env.GOOGLE_GMAIL_CLIENT_ID && env.GOOGLE_GMAIL_CLIENT_SECRET && env.GOOGLE_GMAIL_REDIRECT_URI && env.GMAIL_OAUTH_STATE_SECRET);
}
