import { defineConfig, devices } from "@playwright/test";

const shouldBypassOwnerAuth = process.env.AIOS_E2E_AUTH_BYPASS !== "false";
const childEnvironment: Record<string, string> = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
);
if (shouldBypassOwnerAuth) {
  delete childEnvironment.NEXT_PUBLIC_SUPABASE_URL;
  delete childEnvironment.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  childEnvironment.AIOS_AUTH_BYPASS = "development-shell";
  childEnvironment.AIOS_RATE_LIMIT_BACKEND = "memory";
  // The full three-project sweep makes more owner API calls per minute than the
  // production default budget; raise the dev-server budget explicitly.
  childEnvironment.AIOS_RATE_LIMIT_REQUESTS = "600";
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3000/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...childEnvironment,
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3000",
    },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "tablet", use: { ...devices["iPad Pro 11"], browserName: "chromium" } },
    { name: "mobile", use: { ...devices["Pixel 7"], browserName: "chromium" } },
  ],
});
