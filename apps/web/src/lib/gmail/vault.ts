import "server-only";

import { Prisma, getDatabaseClient } from "@aios/data";

export async function createVaultSecret(value: string, name: string, description: string): Promise<string> {
  const rows = await getDatabaseClient().$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT vault.create_secret(${value}, ${name}, ${description})::text AS id
  `);
  const id = rows[0]?.id;
  if (!id) throw new Error("Supabase Vault did not return a credential reference.");
  return id;
}

export async function readVaultSecret(id: string): Promise<string> {
  const rows = await getDatabaseClient().$queryRaw<Array<{ decrypted_secret: string }>>(Prisma.sql`
    SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = ${id}::uuid
  `);
  const value = rows[0]?.decrypted_secret;
  if (!value) throw new Error("The Gmail credential is unavailable in Supabase Vault.");
  return value;
}

export async function removeVaultSecret(id: string): Promise<void> {
  await getDatabaseClient().$executeRaw(Prisma.sql`DELETE FROM vault.secrets WHERE id = ${id}::uuid`);
}
