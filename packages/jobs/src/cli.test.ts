import { describe, expect, it } from "vitest";

import { parseJobsCliArgs, runJobsCli } from "./cli";

describe("jobs CLI", () => {
  it("requires an explicit environment and runtime", () => {
    expect(() => parseJobsCliArgs(["--runtime", "./runtime.ts"])).toThrow(
      "--environment is required.",
    );
    expect(() => parseJobsCliArgs(["--environment", "production"])).toThrow(
      "--runtime is required.",
    );
  });

  it("defaults to a single run", () => {
    expect(parseJobsCliArgs([
      "--environment", "staging", "--runtime", "./runtime.ts",
    ])).toMatchObject({ mode: "once", environment: "staging" });
  });

  it("rejects daemon mode in tests before importing the runtime", async () => {
    await expect(runJobsCli([
      "--environment", "development",
      "--runtime", "./does-not-exist.ts",
      "--daemon",
    ], { NODE_ENV: "test" })).rejects.toThrow("Daemon mode is disabled");
  });
});
