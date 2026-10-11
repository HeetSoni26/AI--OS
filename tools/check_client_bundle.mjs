import fs from "node:fs";
import path from "node:path";

const staticRoot = path.resolve("apps/web/.next/static");
const forbiddenNames = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "UPSTASH_REDIS_REST_TOKEN",
  "SENTRY_AUTH_TOKEN",
  "AXIOM_TOKEN",
];
const configuredSecrets = forbiddenNames.map((name) => process.env[name]).filter((value) => value && value.length >= 8);

function filesUnder(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(target) : [target];
  });
}

const findings = [];
for (const file of filesUnder(staticRoot)) {
  const content = fs.readFileSync(file, "utf8");
  for (const forbidden of [...forbiddenNames, ...configuredSecrets]) {
    if (content.includes(forbidden)) findings.push(`${file}: ${forbiddenNames.includes(forbidden) ? forbidden : "configured secret value"}`);
  }
}

if (findings.length) {
  console.error("Server-only identifiers or values were found in client assets:");
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exit(1);
}

console.log(`Client bundle secret scan passed (${filesUnder(staticRoot).length} static assets checked).`);
