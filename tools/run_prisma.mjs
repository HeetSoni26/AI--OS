import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
const envFile = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
const directUrlInFile = /^DIRECT_URL\s*=\s*(?!\s*$).+/m.test(envFile);

if (!process.env.DIRECT_URL && !directUrlInFile) {
  console.error("DIRECT_URL is required for migration, status, and seed commands. Configure it in untracked root .env or the process environment.");
  process.exit(1);
}

const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");
const result = spawnSync(process.execPath, [prismaCli, ...process.argv.slice(2), "--config", path.join(root, "prisma.config.ts")], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});
process.exit(result.status ?? 1);
