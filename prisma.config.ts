import "dotenv/config";
import { defineConfig } from "prisma/config";

const directUrl = process.env.DIRECT_URL ?? "postgresql://aios:aios@127.0.0.1:5432/aios";

export default defineConfig({
  schema: "packages/data/prisma/schema.prisma",
  migrations: {
    path: "packages/data/prisma/migrations",
    seed: "tsx packages/data/prisma/seed.ts",
  },
  datasource: {
    // Prisma CLI operations use the direct/admin connection. Application code uses DATABASE_URL.
    url: directUrl,
  },
});
