import { beforeEach, describe, expect, it } from "vitest";
import { checkMemoryLimit, enforceLoginLimit, resetMemoryLimits } from "./login";

describe("login attempt limiter", () => {
  beforeEach(() => resetMemoryLimits());

  it("allows five attempts in fifteen minutes and blocks the sixth", () => {
    const now = Date.UTC(2026, 7, 1);
    for (let attempt = 1; attempt <= 5; attempt += 1) expect(checkMemoryLimit("127.0.0.1", now).allowed).toBe(true);
    const blocked = checkMemoryLimit("127.0.0.1", now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBe(900);
  });

  it("opens a new window after fifteen minutes", () => {
    const now = Date.UTC(2026, 7, 1);
    for (let attempt = 0; attempt < 6; attempt += 1) checkMemoryLimit("127.0.0.1", now);
    expect(checkMemoryLimit("127.0.0.1", now + 900_001).allowed).toBe(true);
  });

  it("uses the deterministic memory backend outside production", async () => {
    process.env.AIOS_RATE_LIMIT_BACKEND = "memory";
    expect(await enforceLoginLimit("test-ip")).toMatchObject({ allowed: true, remaining: 4 });
  });
});
