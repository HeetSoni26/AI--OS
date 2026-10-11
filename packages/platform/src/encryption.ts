import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { z } from "zod";

export const encryptedEnvelopeSchema = z.object({
  version: z.literal(1),
  algorithm: z.literal("aes-256-gcm"),
  keyVersion: z.number().int().positive(),
  iv: z.string().regex(/^[A-Za-z0-9_-]+$/),
  ciphertext: z.string().regex(/^[A-Za-z0-9_-]+$/),
  authTag: z.string().regex(/^[A-Za-z0-9_-]+$/),
});
export type EncryptedEnvelope = z.infer<typeof encryptedEnvelopeSchema>;

function encryptionKey(secret: string): Buffer {
  if (secret.length < 32) throw new Error("Application encryption secret must contain at least 32 characters.");
  return createHash("sha256").update(secret).digest();
}

export function encryptApplicationValue(value: string, secret: string, keyVersion = 1): EncryptedEnvelope {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    version: 1,
    algorithm: "aes-256-gcm",
    keyVersion,
    iv: iv.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url"),
  };
}

export function decryptApplicationValue(envelope: EncryptedEnvelope, secret: string): string {
  const parsed = encryptedEnvelopeSchema.parse(envelope);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), Buffer.from(parsed.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(parsed.authTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(parsed.ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
