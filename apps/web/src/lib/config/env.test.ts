import { afterEach, describe, expect, it, vi } from "vitest";

const original = { ...process.env };

async function loadEnv(overrides: Record<string, string | undefined> = {}) {
  vi.resetModules();
  process.env = { ...original };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return import("./env");
}

afterEach(() => {
  process.env = { ...original };
  vi.restoreAllMocks();
});

describe("environment contracts", () => {
  it("uses safe local defaults without inventing provider credentials", async () => {
    const env = await loadEnv({ NEXT_PUBLIC_APP_URL: undefined, NEXT_PUBLIC_SUPABASE_URL: undefined, NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined, AIOS_RATE_LIMIT_BACKEND: "memory" });
    expect(env.getPublicEnv().NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
    expect(env.isSupabaseConfigured()).toBe(false);
    expect(env.isRateLimitConfigured()).toBe(true);
  });

  it("recognizes configured Supabase and Upstash services", async () => {
    const env = await loadEnv({
      NEXT_PUBLIC_APP_URL: "https://aios.example.com",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      AIOS_RATE_LIMIT_BACKEND: "upstash",
      UPSTASH_REDIS_REST_URL: "https://redis.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "redis-token",
      AIOS_OWNER_EMAIL: "owner@example.com",
      AIOS_ENVIRONMENT: "preview",
      DATABASE_URL: "postgresql://pooler/database",
      DIRECT_URL: "postgresql://direct/database",
      APPLICATION_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef",
      WEBHOOK_SIGNING_SECRET: "abcdef0123456789abcdef0123456789",
    });
    expect(env.isSupabaseConfigured()).toBe(true);
    expect(env.isRateLimitConfigured()).toBe(true);
    expect(env.isDatabaseConfigured()).toBe(true);
    expect(env.isPlatformSecurityConfigured()).toBe(true);
    expect(env.getServerEnv()).toMatchObject({ AIOS_OWNER_EMAIL: "owner@example.com", AIOS_ENVIRONMENT: "preview" });
  });

  it("reports an incomplete production rate limiter", async () => {
    const env = await loadEnv({ AIOS_RATE_LIMIT_BACKEND: "upstash", UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: undefined });
    expect(env.isRateLimitConfigured()).toBe(false);
  });
});
