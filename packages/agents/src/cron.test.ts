import { describe, expect, it } from "vitest";
import { minuteBucket, nextCronFire, parseCronExpression } from "./cron";

describe("parseCronExpression", () => {
  it("parses a wildcard expression", () => {
    const cron = parseCronExpression("* * * * *");
    expect(cron.minute.values.size).toBe(60);
    expect(cron.dayOfWeek.values.size).toBe(7);
  });

  it("parses ranges, steps, and lists", () => {
    const cron = parseCronExpression("0,30 9-17 */2 1-6 1,5");
    expect(cron.minute.values).toEqual(new Set([0, 30]));
    expect(cron.hour.values).toEqual(new Set([9, 10, 11, 12, 13, 14, 15, 16, 17]));
    expect(cron.dayOfMonth.values).toEqual(new Set([1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31]));
    expect(cron.month.values).toEqual(new Set([1, 2, 3, 4, 5, 6]));
    expect(cron.dayOfWeek.values).toEqual(new Set([1, 5]));
  });

  it("rejects invalid expressions", () => {
    expect(() => parseCronExpression("60 * * * *")).toThrow();
    expect(() => parseCronExpression("* * *")).toThrow();
    expect(() => parseCronExpression("* 25 * * *")).toThrow();
    expect(() => parseCronExpression("*/0 * * * *")).toThrow();
  });
});

describe("nextCronFire", () => {
  it("computes the next daily fire time", () => {
    const after = new Date("2026-10-08T14:23:00Z");
    const next = nextCronFire("0 9 * * *", after);
    expect(next).toEqual(new Date("2026-10-09T09:00:00Z"));
  });

  it("computes the next hourly fire time within the same hour", () => {
    const after = new Date("2026-10-08T14:23:00Z");
    const next = nextCronFire("30 * * * *", after);
    expect(next).toEqual(new Date("2026-10-08T14:30:00Z"));
  });

  it("handles midnight rollovers and month boundaries", () => {
    const after = new Date("2026-12-31T23:59:00Z");
    const next = nextCronFire("0 0 1 * *", after);
    expect(next).toEqual(new Date("2027-01-01T00:00:00Z"));
  });

  it("skips months where the day-of-month cannot match", () => {
    const after = new Date("2026-01-31T10:00:00Z");
    const next = nextCronFire("0 0 31 * *", after);
    expect(next).toEqual(new Date("2026-03-31T00:00:00Z"));
  });

  it("returns null for impossible dates like February 31st", () => {
    const after = new Date("2026-01-31T10:00:00Z");
    expect(nextCronFire("0 0 31 2 *", after)).toBeNull();
  });

  it("returns strictly-later times", () => {
    const after = new Date("2026-10-08T14:00:00Z");
    const next = nextCronFire("* * * * *", after);
    expect(next!.getTime()).toBeGreaterThan(after.getTime());
  });
});

describe("minuteBucket", () => {
  it("buckets by minute for idempotent scheduled dispatches", () => {
    const a = minuteBucket(new Date("2026-10-08T14:23:59Z"));
    const b = minuteBucket(new Date("2026-10-08T14:23:01Z"));
    const c = minuteBucket(new Date("2026-10-08T14:24:01Z"));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toBe("2026-10-08T14:23");
  });
});
