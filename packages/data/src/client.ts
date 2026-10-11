import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client/client";

export interface CreateDatabaseClientOptions {
  connectionString?: string;
  connectionLimit?: number;
}

type GlobalDatabase = typeof globalThis & { __aiosPrisma?: PrismaClient };

function requireDatabaseUrl(value = process.env.DATABASE_URL): string {
  if (!value) throw new Error("DATABASE_URL is required to create the AI OS database client.");
  return value;
}

export function createDatabaseClient(options: CreateDatabaseClientOptions = {}): PrismaClient {
  const connectionString = requireDatabaseUrl(options.connectionString);
  const adapter = new PrismaPg({
    connectionString,
    max: options.connectionLimit ?? 10,
    connectionTimeoutMillis: 2_000,
    application_name: "aios",
  });
  return new PrismaClient({ adapter });
}

export function getDatabaseClient(): PrismaClient {
  const globalDatabase = globalThis as GlobalDatabase;
  if (!globalDatabase.__aiosPrisma) globalDatabase.__aiosPrisma = createDatabaseClient();
  return globalDatabase.__aiosPrisma;
}

export async function disconnectDatabase(): Promise<void> {
  const globalDatabase = globalThis as GlobalDatabase;
  if (!globalDatabase.__aiosPrisma) return;
  await globalDatabase.__aiosPrisma.$disconnect();
  delete globalDatabase.__aiosPrisma;
}

export async function checkDatabaseConnection(client = getDatabaseClient()): Promise<boolean> {
  try {
    await client.$queryRaw`SELECT 1 AS ready`;
    return true;
  } catch {
    return false;
  }
}
