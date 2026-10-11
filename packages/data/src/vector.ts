import { Prisma, type PrismaClient } from "./generated/client/client";

export const EMBEDDING_DIMENSIONS = 1536;

export interface SimilarKnowledgeResult {
  id: string;
  title: string;
  content: string;
  distance: number;
}

export function serializeEmbedding(embedding: readonly number[]): string {
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new RangeError(`Embedding must have exactly ${EMBEDDING_DIMENSIONS} dimensions.`);
  }
  if (!embedding.every(Number.isFinite)) throw new TypeError("Embedding values must be finite numbers.");
  return `[${embedding.join(",")}]`;
}

export async function findSimilarKnowledge(
  client: PrismaClient,
  embedding: readonly number[],
  options: { limit?: number; clientId?: string | null } = {},
): Promise<SimilarKnowledgeResult[]> {
  const limit = options.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError("Similarity result limit must be between 1 and 100.");
  const serialized = serializeEmbedding(embedding);
  const clientFilter = options.clientId === undefined
    ? Prisma.empty
    : options.clientId === null
      ? Prisma.sql`AND client_id IS NULL`
      : Prisma.sql`AND client_id = ${options.clientId}::uuid`;

  const rows = await client.$queryRaw<Array<{ id: string; title: string; content: string; distance: number | string }>>(Prisma.sql`
    SELECT id, title, content, embedding OPERATOR(extensions.<=>) ${serialized}::extensions.vector AS distance
    FROM public.knowledge_entries
    WHERE embedding IS NOT NULL AND deleted_at IS NULL ${clientFilter}
    ORDER BY embedding OPERATOR(extensions.<=>) ${serialized}::extensions.vector
    LIMIT ${limit}
  `);
  return rows.map((row) => ({ ...row, distance: Number(row.distance) }));
}
