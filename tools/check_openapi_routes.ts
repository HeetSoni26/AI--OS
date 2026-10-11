import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import routeManifest from "../apps/web/src/lib/api/registry.json" with { type: "json" };
import { openApiDocument } from "../apps/web/src/lib/api/openapi";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiRoot = path.join(root, "apps", "web", "src", "app", "api");
const methodNames = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;

type RouteRecord = { filesystem: string; path: string; methods: string[] };

async function routeDirectories(directory: string, segments: string[] = []): Promise<RouteRecord[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const routeFile = entries.find((entry) => entry.isFile() && entry.name === "route.ts");
  const routes: RouteRecord[] = [];
  if (routeFile) {
    const source = await readFile(path.join(directory, routeFile.name), "utf8");
    const methods = methodNames.filter((method) => new RegExp(`export\\s+(?:(?:async\\s+)?function|const)\\s+${method}\\b`, "u").test(source));
    routes.push({ filesystem: `/api/${segments.join("/")}`, path: `/api/${segments.map((segment) => segment.replace(/^\[([^\]]+)\]$/u, "{$1}")).join("/")}`, methods });
  }
  for (const entry of entries) {
    if (entry.isDirectory()) routes.push(...await routeDirectories(path.join(directory, entry.name), [...segments, entry.name]));
  }
  return routes;
}

const normalized = (records: RouteRecord[]) => records
  .map((route) => ({ ...route, methods: [...route.methods].sort() }))
  .sort((left, right) => left.filesystem.localeCompare(right.filesystem));
async function main() {
  const filesystem = normalized(await routeDirectories(apiRoot));
  const registered = normalized(routeManifest);
  const documented = normalized(Object.entries(openApiDocument.paths).map(([routePath, operations]) => {
    const registration = routeManifest.find((route) => route.path === routePath);
    return {
      filesystem: registration?.filesystem ?? routePath,
      path: routePath,
      methods: Object.keys(operations).filter((method) => methodNames.includes(method.toUpperCase() as typeof methodNames[number])).map((method) => method.toUpperCase()),
    };
  }));

  const same = (left: RouteRecord[], right: RouteRecord[]) => JSON.stringify(left) === JSON.stringify(right);
  if (!same(filesystem, registered) || !same(registered, documented)) {
    console.error(JSON.stringify({ filesystem, registered, documented }, null, 2));
    process.exit(1);
  }
  console.log(`OpenAPI path/method drift check passed for ${registered.length} implemented routes.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "OpenAPI validation failed.");
  process.exit(1);
});
