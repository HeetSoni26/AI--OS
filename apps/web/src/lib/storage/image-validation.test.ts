import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CLIENT_LOGO_LIMIT_BYTES, validateClientLogo } from "./image-validation";

function png(width = 32, height = 24): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

describe("client logo validation", () => {
  it("accepts a bounded PNG based on bytes, not extension", () => {
    const bytes = png();
    expect(validateClientLogo(bytes, "image/png")).toMatchObject({
      contentType: "image/png",
      extension: "png",
      width: 32,
      height: 24,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  });

  it("rejects declared/detected type mismatch and SVG", () => {
    expect(() => validateClientLogo(png(), "image/jpeg")).toThrowError(/do not match/i);
    expect(() => validateClientLogo(new TextEncoder().encode("<svg></svg>"), "image/svg+xml")).toThrowError(/PNG, JPEG, or WebP/i);
  });

  it("rejects invalid dimensions and oversized content", () => {
    expect(() => validateClientLogo(png(5000, 24), "image/png")).toThrowError(/dimensions/i);
    expect(() => validateClientLogo(new Uint8Array(CLIENT_LOGO_LIMIT_BYTES + 1), "image/png")).toThrowError(/5 MiB/i);
  });
});
