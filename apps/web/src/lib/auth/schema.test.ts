import { describe, expect, it } from "vitest";
import { emailSchema, passwordSchema } from "./schema";

describe("authentication validation", () => {
  it("normalizes owner email addresses", () => {
    expect(emailSchema.parse(" Owner@Example.com ")).toBe("owner@example.com");
  });

  it("requires the SRS password complexity policy", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("longpassword").success).toBe(false);
    expect(passwordSchema.safeParse("Longpassword1!").success).toBe(true);
  });
});
