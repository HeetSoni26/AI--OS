import type { HealthResponse } from "@aios/contracts";

export function GET() {
  const body: HealthResponse = {
    status: "ok",
    service: "aios-web",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? "0.1.0",
  };
  return Response.json(body, { headers: { "cache-control": "no-store" } });
}
