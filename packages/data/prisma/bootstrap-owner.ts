import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { z } from "zod";

config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });
import { createDatabaseClient } from "../src/index";

const input = z.object({
  authSubject: z.uuid(),
  email: z.email(),
  displayName: z.string().min(1).max(255).default("Agency Owner"),
}).parse({
  authSubject: process.env.AIOS_OWNER_AUTH_SUBJECT,
  email: process.env.AIOS_OWNER_EMAIL,
  displayName: process.env.AIOS_OWNER_DISPLAY_NAME,
});

const prisma = createDatabaseClient({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL });

await prisma.$transaction(async (transaction) => {
  const owners = await transaction.ownerAccount.count({ where: { active: true } });
  const existing = await transaction.ownerAccount.findUnique({ where: { authSubject: input.authSubject } });
  if (owners > 0 && !existing) throw new Error("An active owner already exists; initial release permits one owner only.");
  await transaction.ownerAccount.upsert({
    where: { authSubject: input.authSubject },
    update: { email: input.email.toLowerCase(), displayName: input.displayName, active: true },
    create: { authSubject: input.authSubject, email: input.email.toLowerCase(), displayName: input.displayName },
  });
});

await prisma.$disconnect();
console.info("Bootstrapped the single AI OS owner registry entry.");
