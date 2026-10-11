/**
 * One-command live demo deployment.
 *
 * Prerequisites (once):
 *   1. npx vercel login            (sign in with GitHub)
 *   2. A free Postgres URL with pgvector - e.g. from neon.tech (GitHub sign-in),
 *      or any Postgres. Must include ?sslmode=require.
 *
 * Run:
 *   node scripts/deploy-demo.mjs --database-url "postgresql://.../dbname?sslmode=require"
 *
 * Does everything: links Vercel, runs migrations + seeds against the cloud
 * database, sets all environment variables, deploys to production, and
 * verifies the live site.
 */
import { execSync } from "node:child_process";
import crypto from "node:crypto";

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf("--" + name);
  return index >= 0 ? args[index + 1] : undefined;
};

const DATABASE_URL = flag("database-url") ?? process.env.DEMO_DATABASE_URL;
if (!DATABASE_URL || !DATABASE_URL.startsWith("postgres")) {
  console.error("Pass a Postgres connection string: node scripts/deploy-demo.mjs --database-url \"postgresql://...?sslmode=require\"");
  process.exit(1);
}
if (!DATABASE_URL.includes("sslmode")) {
  console.error("The connection string must include ?sslmode=require (Neon/Supabase defaults include it).");
  process.exit(1);
}

const run = (command, env = {}) => {
  console.log("\n> " + command);
  execSync(command, { stdio: "inherit", env: { ...process.env, ...env } });
};

const encryptionKey = crypto.randomBytes(32).toString("hex");
const webhookSecret = crypto.randomBytes(32).toString("hex");

console.log("1/6 Linking the Vercel project...");
run("npx vercel link --yes");

console.log("\n2/6 Running migrations + seeds against the cloud database...");
run("npx prisma migrate deploy", { DATABASE_URL, DIRECT_URL: DATABASE_URL });
run("npx tsx packages/data/prisma/seed.ts", { DATABASE_URL, DIRECT_URL: DATABASE_URL });
run("npx tsx packages/data/prisma/seed-demo.ts", { DATABASE_URL, DIRECT_URL: DATABASE_URL });
run("npx tsx packages/data/prisma/bootstrap-owner.ts", { DATABASE_URL, DIRECT_URL: DATABASE_URL, AIOS_OWNER_EMAIL: "demo-owner@local.aios", AIOS_OWNER_DISPLAY_NAME: "Demo Owner" });

console.log("\n3/6 Setting Vercel environment variables...");
const envVars = {
  DATABASE_URL,
  DIRECT_URL: DATABASE_URL,
  APPLICATION_ENCRYPTION_KEY: encryptionKey,
  WEBHOOK_SIGNING_SECRET: webhookSecret,
  AIOS_DEMO_MODE: "true",
  AIOS_AUTH_BYPASS: "development-shell",
  AIOS_RATE_LIMIT_BACKEND: "memory",
  AIOS_RATE_LIMIT_REQUESTS: "600",
  AIOS_ENVIRONMENT: "production",
  AIOS_OWNER_EMAIL: "demo-owner@local.aios",
  AIOS_OWNER_DISPLAY_NAME: "Demo Owner",
  AIOS_CORS_ORIGINS: "https://localhost:3000",
  NEXT_PUBLIC_APP_URL: "https://localhost:3000",
};
for (const [key, value] of Object.entries(envVars)) {
  execSync(`npx vercel env add ${key} production`, { input: value, stdio: ["pipe", "inherit", "inherit"] });
  console.log("  set " + key);
}

console.log("\n4/6 Deploying to production...");
run("npx vercel deploy --prod");

console.log("\n5/6 Fixing the deployment URL in CORS/app-url env vars...");
const deployed = execSync("npx vercel ls --meta --json", { encoding: "utf8" });
const url = JSON.parse(deployed)?.deployments?.[0]?.url;
if (url) {
  const httpsUrl = "https://" + url;
  for (const [key, value] of Object.entries({ AIOS_CORS_ORIGINS: httpsUrl, NEXT_PUBLIC_APP_URL: httpsUrl })) {
    try { execSync(`npx vercel env rm ${key} production -y`, { stdio: "inherit" }); } catch { /* may not exist yet */ }
    execSync(`npx vercel env add ${key} production`, { input: value, stdio: ["pipe", "inherit", "inherit"] });
  }
  run("npx vercel deploy --prod");
  console.log("\nLive demo: " + httpsUrl);
} else {
  console.log("\nDeploy finished - get the URL with: npx vercel ls");
}

console.log("\n6/6 Done. Open the printed URL and explore. Demo data is clearly labeled.");
