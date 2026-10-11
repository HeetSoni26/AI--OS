const PRIVATE_STORAGE_BUCKETS = new Set([
  "client-files",
  "client-logos",
  "receipts",
  "templates",
  "media",
  "chatbot-sources",
  "exports",
  "reports",
]);

export interface StorageObjectReference {
  readonly bucket: string;
  readonly objectPath: string;
}

export interface StorageObjectRemover {
  readonly configured: boolean;
  remove(objects: readonly StorageObjectReference[], signal?: AbortSignal): Promise<void>;
}

export interface SupabaseStorageConfiguration {
  readonly url: string;
  readonly serviceRoleKey: string;
  readonly fetch?: typeof fetch;
  readonly batchSize?: number;
}

export interface StorageObjectCleanupRequestedPayload {
  readonly schemaVersion: 1;
  readonly bucket: string;
  readonly objectPath: string;
  readonly fileId: string;
}

function requirePrivateObject(reference: StorageObjectReference): StorageObjectReference {
  const bucket = reference.bucket.trim();
  const objectPath = reference.objectPath.trim();
  if (!PRIVATE_STORAGE_BUCKETS.has(bucket)) {
    throw new Error(`Storage cleanup refused non-private or unknown bucket: ${bucket || "(empty)"}.`);
  }
  if (!objectPath || objectPath.startsWith("/") || objectPath.includes("\0")) {
    throw new Error("Storage cleanup refused an invalid object path.");
  }
  return { bucket, objectPath };
}

function configuredUrl(value: string): string {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    throw new Error("Supabase Storage URL must use HTTPS outside localhost.");
  }
  return parsed.href.replace(/\/$/u, "");
}

/** Strictly validates the durable storage-cleanup event before any destructive call. */
export function parseStorageObjectCleanupRequestedPayload(
  value: Record<string, unknown>,
): StorageObjectCleanupRequestedPayload {
  const keys = Object.keys(value).sort();
  const expected = ["bucket", "fileId", "objectPath", "schemaVersion"];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new Error("storage.object_cleanup_requested payload has unexpected fields.");
  }
  if (value.schemaVersion !== 1) {
    throw new Error("storage.object_cleanup_requested requires schemaVersion 1.");
  }
  if (typeof value.fileId !== "string" || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/iu.test(value.fileId)) {
    throw new Error("storage.object_cleanup_requested requires a fileId UUID.");
  }
  if (typeof value.bucket !== "string" || typeof value.objectPath !== "string") {
    throw new Error("storage.object_cleanup_requested requires bucket and objectPath strings.");
  }
  const reference = requirePrivateObject({ bucket: value.bucket, objectPath: value.objectPath });
  return {
    schemaVersion: 1,
    bucket: reference.bucket,
    objectPath: reference.objectPath,
    fileId: value.fileId,
  };
}

export class UnconfiguredStorageObjectRemover implements StorageObjectRemover {
  readonly configured = false;

  async remove(objects: readonly StorageObjectReference[]): Promise<void> {
    if (objects.length === 0) return;
    throw new Error(
      "Supabase Storage deletion is not configured; set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
}

/** Server-only Supabase Storage remover. Replaying an already-removed path is safe. */
export class SupabaseStorageObjectRemover implements StorageObjectRemover {
  readonly configured = true;
  private readonly url: string;
  private readonly serviceRoleKey: string;
  private readonly fetchImplementation: typeof fetch;
  private readonly batchSize: number;

  constructor(configuration: SupabaseStorageConfiguration) {
    this.url = configuredUrl(configuration.url);
    this.serviceRoleKey = configuration.serviceRoleKey.trim();
    if (!this.serviceRoleKey) throw new Error("Supabase service-role key is required.");
    this.fetchImplementation = configuration.fetch ?? globalThis.fetch;
    this.batchSize = configuration.batchSize ?? 100;
    if (!Number.isInteger(this.batchSize) || this.batchSize < 1 || this.batchSize > 1_000) {
      throw new Error("Supabase Storage deletion batch size must be between 1 and 1000.");
    }
  }

  async remove(objects: readonly StorageObjectReference[], signal?: AbortSignal): Promise<void> {
    const byBucket = new Map<string, Set<string>>();
    for (const rawReference of objects) {
      const reference = requirePrivateObject(rawReference);
      const paths = byBucket.get(reference.bucket) ?? new Set<string>();
      paths.add(reference.objectPath);
      byBucket.set(reference.bucket, paths);
    }
    for (const [bucket, pathSet] of [...byBucket].sort(([left], [right]) => left.localeCompare(right))) {
      const paths = [...pathSet].sort();
      for (let offset = 0; offset < paths.length; offset += this.batchSize) {
        if (signal?.aborted) throw signal.reason ?? new Error("Storage cleanup was stopped.");
        const batch = paths.slice(offset, offset + this.batchSize);
        const response = await this.fetchImplementation(
          `${this.url}/storage/v1/object/${encodeURIComponent(bucket)}`,
          {
            method: "DELETE",
            headers: {
              accept: "application/json",
              apikey: this.serviceRoleKey,
              authorization: `Bearer ${this.serviceRoleKey}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({ prefixes: batch }),
            cache: "no-store",
            ...(signal === undefined ? {} : { signal }),
          },
        );
        if (!response.ok) {
          throw new Error(`Supabase Storage cleanup failed with HTTP ${response.status}.`);
        }
      }
    }
  }
}
