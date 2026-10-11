import { Redis } from "@upstash/redis";
import { getServerEnv } from "@/lib/config/env";

const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 15 * 60;
const memoryAttempts = new Map<string, { count: number; resetAt: number }>();

export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSeconds: number };

export function checkMemoryLimit(identifier: string, now = Date.now()): RateLimitResult {
  const existing = memoryAttempts.get(identifier);
  if (!existing || existing.resetAt <= now) {
    memoryAttempts.set(identifier, { count: 1, resetAt: now + WINDOW_SECONDS * 1000 });
    return { allowed: true, remaining: MAX_ATTEMPTS - 1, retryAfterSeconds: WINDOW_SECONDS };
  }
  existing.count += 1;
  memoryAttempts.set(identifier, existing);
  return {
    allowed: existing.count <= MAX_ATTEMPTS,
    remaining: Math.max(0, MAX_ATTEMPTS - existing.count),
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

export async function enforceLoginLimit(identifier: string): Promise<RateLimitResult> {
  const env = getServerEnv();
  if (env.AIOS_RATE_LIMIT_BACKEND === "memory") {
    if (process.env.NODE_ENV === "production") throw new Error("The in-memory login limiter is forbidden in production.");
    return checkMemoryLimit(identifier);
  }
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) throw new Error("Upstash Redis credentials are required for production login throttling.");
  const redis = new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN });
  const key = `aios:login:${identifier}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, WINDOW_SECONDS);
  const ttl = Math.max(1, await redis.ttl(key));
  return { allowed: count <= MAX_ATTEMPTS, remaining: Math.max(0, MAX_ATTEMPTS - count), retryAfterSeconds: ttl };
}

export function resetMemoryLimits() {
  memoryAttempts.clear();
}
