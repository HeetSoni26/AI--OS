import { createHash } from "node:crypto";
import { API_RATE_LIMIT_REQUESTS, API_RATE_LIMIT_WINDOW_SECONDS } from "@aios/contracts";
import { Redis } from "@upstash/redis";
import { getServerEnv } from "@/lib/config/env";

export interface ApiRateLimitInput {
  /** A stable, non-secret authenticated session identifier. */
  identifier: string;
  request: Request;
  limit: number;
  windowSeconds: number;
}

export interface ApiRateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds?: number;
}

export interface ApiRateLimiter {
  check(input: ApiRateLimitInput): Promise<ApiRateLimitResult>;
}

const memoryWindows = new Map<string, { count: number; resetAt: number }>();

export function hashRateLimitIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function createMemoryApiRateLimiter(now: () => number = Date.now): ApiRateLimiter {
  return {
    async check(input) {
      const current = now();
      const key = hashRateLimitIdentifier(input.identifier);
      let window = memoryWindows.get(key);
      if (!window || window.resetAt <= current) {
        window = { count: 0, resetAt: current + input.windowSeconds * 1000 };
      }
      window.count += 1;
      memoryWindows.set(key, window);
      const allowed = window.count <= input.limit;
      return {
        allowed,
        limit: input.limit,
        remaining: Math.max(0, input.limit - window.count),
        resetAt: new Date(window.resetAt),
        ...(!allowed ? { retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - current) / 1000)) } : {}),
      };
    },
  };
}

export function createUpstashApiRateLimiter(redis: Redis): ApiRateLimiter {
  return {
    async check(input) {
      const key = `aios:rate:api:${hashRateLimitIdentifier(input.identifier)}`;
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, input.windowSeconds);
      const ttl = Math.max(1, await redis.ttl(key));
      const allowed = count <= input.limit;
      return {
        allowed,
        limit: input.limit,
        remaining: Math.max(0, input.limit - count),
        resetAt: new Date(Date.now() + ttl * 1000),
        ...(!allowed ? { retryAfterSeconds: ttl } : {}),
      };
    },
  };
}

export function createConfiguredApiRateLimiter(): ApiRateLimiter {
  const env = getServerEnv();
  if (env.AIOS_RATE_LIMIT_BACKEND === "memory") {
    if (process.env.NODE_ENV === "production" && process.env.AIOS_DEMO_MODE !== "true") throw new Error("The in-memory API limiter is forbidden in production.");
    return createMemoryApiRateLimiter();
  }
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    throw new Error("Upstash Redis credentials are required for API throttling.");
  }
  return createUpstashApiRateLimiter(new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN }));
}

export function resetMemoryApiRateLimits(): void {
  memoryWindows.clear();
}

export function createRateLimitInput(identifier: string, request: Request): ApiRateLimitInput {
  // Test harnesses (Playwright webServer) may raise the budget explicitly; the
  // production default remains the contract constant.
  const configuredLimit = Number(process.env.AIOS_RATE_LIMIT_REQUESTS ?? "");
  return {
    identifier,
    request,
    limit: Number.isFinite(configuredLimit) && configuredLimit > 0 ? Math.floor(configuredLimit) : API_RATE_LIMIT_REQUESTS,
    windowSeconds: API_RATE_LIMIT_WINDOW_SECONDS,
  };
}

export function getRateLimitHeaders(result: ApiRateLimitResult): Headers {
  const headers = new Headers({
    "x-ratelimit-limit": String(result.limit),
    "x-ratelimit-remaining": String(Math.max(0, result.remaining)),
    "x-ratelimit-reset": String(Math.ceil(result.resetAt.getTime() / 1000)),
  });
  if (!result.allowed) headers.set("retry-after", String(result.retryAfterSeconds ?? Math.max(1, Math.ceil((result.resetAt.getTime() - Date.now()) / 1000))));
  return headers;
}
