import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiRoot = path.join(root, "apps", "web", "src", "app", "api");
const registryPath = path.join(root, "apps", "web", "src", "lib", "api", "registry.ts");
const openApiPath = path.join(root, "apps", "web", "src", "lib", "api", "openapi.ts");

async function routeDirectories(directory, segments = []) {
  const entries = await readdir(directory, { withFileTypes: true });
  const routes = [];
  if (entries.some((entry) => entry.isFile() && entry.name === "route.ts")) routes.push(`/api/${segments.join("/")}`);
  for (const entry of entries) {
    if (entry.isDirectory()) routes.push(...await routeDirectories(path.join(directory, entry.name), [...segments, entry.name]));
  }
  return routes;
}

const registrySource = await readFile(registryPath, "utf8");
const documentedSource = await readFile(openApiPath, "utf8");
const registered = [...registrySource.matchAll(/"(\/api\/[^\"]+)"/g)].map((match) => match[1]).sort();
const documented = [...documentedSource.matchAll(/^\s{6}"(\/api\/[^\"]+)": \{/gm)].map((match) => match[1]).sort();
const filesystem = (await routeDirectories(apiRoot)).sort();

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
if (!same(filesystem, registered) || !same(registered, documented)) {
  console.error(JSON.stringify({ filesystem, registered, documented }, null, 2));
  process.exit(1);
}
console.log(`OpenAPI drift check passed for ${registered.length} implemented routes.`);
