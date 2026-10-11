export type DataClassification = "public" | "internal" | "confidential_client" | "financial_sensitive" | "credential" | "security_audit";

export const storageBuckets = {
  clientFiles: { name: "client-files", visibility: "private", classification: "confidential_client" },
  clientLogos: { name: "client-logos", visibility: "private", classification: "confidential_client" },
  receipts: { name: "receipts", visibility: "private", classification: "financial_sensitive" },
  templates: { name: "templates", visibility: "private", classification: "internal" },
  media: { name: "media", visibility: "private_until_published", classification: "confidential_client" },
  chatbotSources: { name: "chatbot-sources", visibility: "private", classification: "confidential_client" },
  exports: { name: "exports", visibility: "private_signed", classification: "confidential_client" },
  reports: { name: "reports", visibility: "private_signed", classification: "confidential_client" },
} as const;

export const redisNamespaces = {
  cache: "aios:cache",
  rateLimit: "aios:rate",
  queue: "aios:queue",
  lock: "aios:lock",
  session: "aios:session",
} as const;

export function storageObjectKey(options: { ownerId: string; bucket: string; entityId: string; fileName: string }): string {
  const safeName = options.fileName.normalize("NFKC").replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
  return `${options.ownerId}/${options.bucket}/${options.entityId}/${safeName}`;
}
