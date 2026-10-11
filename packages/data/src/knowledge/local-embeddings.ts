import { createHash } from "node:crypto";
import { EMBEDDING_DIMENSIONS } from "@aios/data";

/**
 * Local deterministic embedding: no external provider required.
 *
 * Text is tokenized, each token is hashed to a bucket with a signed weight
 * (hashing-trick / "bag of hashed words"), and the vector is L2-normalized.
 * Similar texts share tokens and therefore score as similar under cosine
 * distance - good enough for offline semantic search, and honest: results are
 * labeled with the local model name so live provider embeddings can replace it
 * (same 1536 dimensions, same storage) by setting an embedding API key.
 */
export const LOCAL_EMBEDDING_MODEL = "local-hash-v1";

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "is", "are",
  "was", "were", "be", "been", "it", "this", "that", "with", "as", "at", "by",
  "from", "but", "not", "have", "has", "had", "you", "your", "we", "our", "i",
]);

export function embedTextLocal(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
  if (tokens.length === 0) return vector;
  for (const token of tokens) {
    const digest = createHash("sha256").update(token, "utf8").digest();
    const bucket = ((digest[0]! << 8) | digest[1]!) % EMBEDDING_DIMENSIONS;
    // Signed weight from the third byte keeps hash collisions from always adding up.
    const sign = digest[2]! % 2 === 0 ? 1 : -1;
    vector[bucket]! += sign * (1 + Math.log(1 + token.length / 8));
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) return vector;
  return vector.map((value) => value / norm);
}
