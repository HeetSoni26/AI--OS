import { storageBuckets } from "./storage";

export interface StorageBucketPolicy {
  id: string;
  public: false;
  fileSizeLimitBytes: number;
  allowedMimeTypes: readonly string[] | null;
  signedAccess: true;
  malwareScanRequired: boolean;
}

const FILE_LIMIT = 100 * 1024 * 1024;
const CLIENT_LOGO_LIMIT = 5 * 1024 * 1024;

export const storageBucketPolicies: readonly StorageBucketPolicy[] = Object.values(storageBuckets).map((bucket) => ({
  id: bucket.name,
  public: false,
  fileSizeLimitBytes: bucket.name === "client-logos" ? CLIENT_LOGO_LIMIT : FILE_LIMIT,
  allowedMimeTypes: bucket.name === "client-logos" ? ["image/png", "image/jpeg", "image/webp"] : null,
  signedAccess: true,
  malwareScanRequired: bucket.name !== "client-logos",
}));

export interface SignedStorageAdapter {
  createSignedUpload(bucket: string, objectPath: string, expiresInSeconds: number): Promise<{ url: string; token: string }>;
  createSignedDownload(bucket: string, objectPath: string, expiresInSeconds: number): Promise<{ url: string }>;
  remove(bucket: string, objectPaths: readonly string[]): Promise<void>;
}

export function assertKnownPrivateBucket(bucket: string): void {
  const policy = storageBucketPolicies.find((candidate) => candidate.id === bucket);
  if (!policy || policy.public) throw new Error("Storage access requires a known private AI OS bucket.");
}
