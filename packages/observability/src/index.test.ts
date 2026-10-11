import { describe, expect, it, vi } from "vitest";
import { createCorrelationId, log, redactMetadata } from "./index";

describe("observability helpers", () => {
  it("creates UUID correlation identifiers", () => {
    expect(createCorrelationId()).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("redacts nested secrets and bearer tokens", () => {
    expect(
      redactMetadata({
        authorization: "Bearer private-token",
        nested: { apiKey: "secret-value", safe: "visible" },
      }),
    ).toEqual({
      authorization: "[REDACTED]",
      nested: { apiKey: "[REDACTED]", safe: "visible" },
    });
  });

  it("writes structured redacted JSON", () => {
    const writer = vi.spyOn(console, "info").mockImplementation(() => undefined);
    log("info", "test event", { token: "hidden", operation: "unit-test" });
    const entry = JSON.parse(String(writer.mock.calls[0]?.[0]));
    expect(entry).toMatchObject({
      level: "info",
      message: "test event",
      token: "[REDACTED]",
      operation: "unit-test",
    });
    writer.mockRestore();
  });
});
