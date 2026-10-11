import { expect, test } from "@playwright/test";
import routeManifest from "../src/lib/api/registry.json";

test("authenticated readiness reports the configured environment honestly", async ({ request }) => {
  const response = await request.get("/api/v1/health", { headers: { "x-request-id": "e2e_readiness" } });
  const body = await response.json();
  const checks = body.data.checks as Record<string, boolean>;
  const ready = Object.values(checks).every(Boolean);

  expect(response.status()).toBe(ready ? 200 : 503);
  expect(response.headers()["x-request-id"]).toBe("e2e_readiness");
  expect(response.headers()["x-api-version"]).toBe("v1");
  expect(body).toMatchObject({
    data: { status: ready ? "ready" : "degraded" },
    meta: { requestId: "e2e_readiness", apiVersion: "v1" },
  });
  expect(Object.keys(checks).sort()).toEqual(["apiRateLimit", "auth", "database", "platformSecurity"]);
});

test("OpenAPI publishes every implemented API route", async ({ request }) => {
  const response = await request.get("/api/openapi");
  expect(response.ok()).toBeTruthy();
  const document = await response.json();
  expect(document.openapi).toBe("3.1.0");
  expect(Object.keys(document.paths).sort()).toEqual(routeManifest.map((route) => route.path).sort());
});

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 1024, height: 900 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`${viewport.name} health endpoint responds`, async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.ok()).toBeTruthy();
    expect(await response.json()).toMatchObject({ status: "ok", service: "aios-web" });
  });
}
