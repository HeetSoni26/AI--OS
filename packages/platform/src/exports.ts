import { z } from "zod";

export const exportManifestSchema = z.object({
  version: z.literal(1),
  exportId: z.uuid(),
  requestedBy: z.string().min(1).max(255),
  format: z.enum(["json", "csv"]),
  scope: z.enum(["full_system", "client", "module"]),
  scopeId: z.uuid().optional(),
  generatedAt: z.string().datetime(),
  classifications: z.array(z.enum(["public", "internal", "confidential_client", "financial_sensitive", "security_audit"])),
  files: z.array(z.object({ entity: z.string().min(1), path: z.string().min(1), recordCount: z.number().int().nonnegative(), sha256: z.string().regex(/^[a-f0-9]{64}$/) })),
});

export type ExportManifest = z.infer<typeof exportManifestSchema>;

export function recordsToCsv(records: Array<Record<string, unknown>>): string {
  if (!records.length) return "";
  const headers = [...new Set(records.flatMap((record) => Object.keys(record)))];
  const escape = (value: unknown) => {
    const raw = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
    return /[",\r\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
  };
  return [headers.join(","), ...records.map((record) => headers.map((header) => escape(record[header])).join(","))].join("\r\n");
}

export function recordsToJson(records: Array<Record<string, unknown>>): string {
  return JSON.stringify({ version: 1, data: records }, null, 2);
}
