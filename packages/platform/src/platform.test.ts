import { describe, expect, it } from "vitest";
import {
  archive,
  assertKnownPrivateBucket,
  canExecuteDeletion,
  canRecover,
  createAuditEvent,
  decryptApplicationValue,
  encryptApplicationValue,
  idempotencyFingerprint,
  mutateWithOutbox,
  recordsToCsv,
  recordsToJson,
  recover,
  schedulePermanentDeletion,
  signWebhookBody,
  storageBucketPolicies,
  storageBuckets,
  storageObjectKey,
  validateDeletionExecution,
  verifyWebhookSignature,
  webhookDedupeKey,
} from "./index";

describe("audit and durable event foundations", () => {
  it("redacts sensitive changes while keeping safe diffs", () => {
    const event = createAuditEvent({ actorId: "owner", action: "update", entityType: "client", entityId: "client", correlationId: "request", before: { name: "A", apiKey: "old" }, after: { name: "B", apiKey: "new" } }, new Date("2026-08-01T00:00:00Z"));
    expect(event.changes.name).toEqual({ before: "A", after: "B" });
    expect(event.changes.apiKey).toBeUndefined();
  });

  it("writes business mutation before its transactional outbox event", async () => {
    const calls: string[] = [];
    const result = await mutateWithOutbox(
      { insertBusinessMutation: async (operation) => { calls.push("mutation"); return operation(); }, insertOutbox: async () => { calls.push("outbox"); } },
      async () => "saved",
      { id: "bb65b17f-4d63-4e76-89d3-49264b1c515c", aggregateType: "client", aggregateId: "e447dc39-2017-4c99-8c97-f205fdad83ae", eventType: "client.created", payload: {}, correlationId: "eb070d82-c4a9-4d34-aea8-cb1a5584401c", idempotencyKey: "client:create:one", occurredAt: "2026-08-01T00:00:00.000Z" },
    );
    expect(result).toBe("saved");
    expect(calls).toEqual(["mutation", "outbox"]);
  });
});

describe("webhook, idempotency, and lifecycle controls", () => {
  it("verifies fresh webhook signatures and rejects replay timestamps", () => {
    const signature = signWebhookBody("payload", "a".repeat(32), 1000);
    expect(verifyWebhookSignature({ rawBody: "payload", signature, secret: "a".repeat(32), timestamp: 1000, now: 1100 })).toBe(true);
    expect(verifyWebhookSignature({ rawBody: "payload", signature, secret: "a".repeat(32), timestamp: 1000, now: 1400 })).toBe(false);
  });

  it("creates stable provider-scoped dedupe and operation fingerprints", () => {
    expect(webhookDedupeKey({ provider: "stripe", connectionId: "bb65b17f-4d63-4e76-89d3-49264b1c515c", providerEventId: "evt_1" })).toBe("stripe:bb65b17f-4d63-4e76-89d3-49264b1c515c:evt_1");
    expect(idempotencyFingerprint("invoice:create:1", "invoice.create", { amount: "10.00" })).toHaveLength(64);
  });

  it("enforces archive, seven-day recovery, and deletion timing", () => {
    const now = new Date("2026-08-01T00:00:00Z");
    const archived = archive(now);
    const scheduled = schedulePermanentDeletion(archived, now);
    expect(canRecover(scheduled, new Date("2026-08-07T23:59:59Z"))).toBe(true);
    expect(canExecuteDeletion(scheduled, new Date("2026-08-08T00:00:00Z"))).toBe(true);
    expect(() => recover(scheduled, new Date("2026-08-08T00:00:00Z"))).toThrow();
  });

  it("blocks early deletion plans", () => {
    const impact = { entityType: "client", entityId: "bb65b17f-4d63-4e76-89d3-49264b1c515c", records: [], files: [], providerReferences: [], legalHold: false };
    const result = validateDeletionExecution({ id: "e447dc39-2017-4c99-8c97-f205fdad83ae", requestedBy: "eb070d82-c4a9-4d34-aea8-cb1a5584401c", requestedAt: "2026-08-01T00:00:00.000Z", notBefore: "2026-08-08T00:00:00.000Z", status: "pending", version: 1, impact }, new Date("2026-08-07T00:00:00Z"));
    expect(result.valid).toBe(false);
  });
});

describe("portable export and storage policies", () => {
  it("round-trips representative JSON and escapes CSV", () => {
    const records = [{ id: "1", name: "Acme, Inc.", tags: ["client", "active"] }];
    expect(JSON.parse(recordsToJson(records)).data).toEqual(records);
    expect(recordsToCsv(records)).toContain('"Acme, Inc."');
    expect(recordsToCsv(records)).toContain('"[""client"",""active""]"');
  });

  it("keeps every operational bucket private by default", () => {
    const visibilities: string[] = Object.values(storageBuckets).map((bucket) => bucket.visibility);
    expect(visibilities).not.toContain("public");
    expect(storageBucketPolicies.every((bucket) => !bucket.public && bucket.signedAccess)).toBe(true);
    expect(storageBucketPolicies.find((bucket) => bucket.id === "client-logos")).toMatchObject({
      fileSizeLimitBytes: 5 * 1024 * 1024,
      allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
      malwareScanRequired: false,
    });
    expect(() => assertKnownPrivateBucket("unknown")).toThrow();
    expect(storageObjectKey({ ownerId: "owner", bucket: "client-files", entityId: "entity", fileName: "Client Contract (final).pdf" })).toBe("owner/client-files/entity/Client-Contract-final-.pdf");
  });

  it("encrypts fallback secret material with authenticated AES-256-GCM", () => {
    const secret = "application-secret-material-at-least-32-characters";
    const encrypted = encryptApplicationValue("provider-secret", secret, 2);
    expect(encrypted.algorithm).toBe("aes-256-gcm");
    expect(encrypted.keyVersion).toBe(2);
    expect(JSON.stringify(encrypted)).not.toContain("provider-secret");
    expect(decryptApplicationValue(encrypted, secret)).toBe("provider-secret");
    expect(() => decryptApplicationValue(encrypted, `${secret}-wrong`)).toThrow();
  });
});
