import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDatabaseClient: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock("@aios/data", () => ({
  FilePurpose: { LOGO: "LOGO" },
  MalwareScanStatus: { SKIPPED: "SKIPPED" },
  getDatabaseClient: mocks.getDatabaseClient,
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.createSupabaseAdminClient }));

import { clientEventSchema } from "@aios/contracts";
import { MalwareScanStatus } from "@aios/data";
import { createClientLogoDownload, removeClientLogo, saveClientLogo } from "./client-logos";

const actor = { subject: "00000000-0000-4000-8000-000000000001", correlationId: "logo_test" };
const image = {
  bytes: new Uint8Array([1, 2, 3]),
  contentType: "image/png" as const,
  extension: "png" as const,
  width: 1,
  height: 1,
  sha256: "a".repeat(64),
};

beforeEach(() => vi.clearAllMocks());

describe("private client logo storage", () => {
  it("returns a five-minute signed private download instead of proxying object bytes", async () => {
    mocks.getDatabaseClient.mockReturnValue({
      fileMetadata: { findFirst: vi.fn().mockResolvedValue({ bucket: "client-logos", objectPath: "client/file.png", checksumSha256: "b".repeat(64) }) },
    });
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: "https://storage.invalid/signed" }, error: null });
    const download = vi.fn();
    mocks.createSupabaseAdminClient.mockReturnValue({ storage: { from: vi.fn(() => ({ createSignedUrl, download })) } });

    await expect(createClientLogoDownload("00000000-0000-4000-8000-000000000010")).resolves.toEqual({
      signedUrl: "https://storage.invalid/signed",
      etag: "b".repeat(64),
    });
    expect(createSignedUrl).toHaveBeenCalledWith("client/file.png", 300);
    expect(download).not.toHaveBeenCalled();
  });

  it("records the strict-image exemption honestly and queues replaced-object cleanup", async () => {
    const outboxCreate = vi.fn().mockResolvedValue(undefined);
    const transaction = {
      fileMetadata: {
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve(data)),
        update: vi.fn().mockResolvedValue(undefined),
      },
      client: { update: vi.fn().mockResolvedValue({ name: "Client", status: "ACTIVE", industry: null, mrr: { toString: () => "0" }, archivedAt: null }) },
      ownerAccount: { findUnique: vi.fn().mockResolvedValue({ id: "00000000-0000-4000-8000-000000000001" }) },
      auditEvent: { create: vi.fn().mockResolvedValue(undefined) },
      outboxEvent: { create: outboxCreate },
    };
    mocks.getDatabaseClient.mockReturnValue({
      client: { findFirst: vi.fn().mockResolvedValue({ id: "00000000-0000-4000-8000-000000000010", logoFileId: "00000000-0000-4000-8000-000000000020", logoFile: { bucket: "client-logos", objectPath: "old/logo.png" } }) },
      $transaction: vi.fn((operation) => operation(transaction)),
    });
    const upload = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });
    mocks.createSupabaseAdminClient.mockReturnValue({ storage: { from: vi.fn(() => ({ upload, remove })) } });

    await saveClientLogo("00000000-0000-4000-8000-000000000010", image, actor);

    expect(transaction.fileMetadata.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ malwareScanStatus: MalwareScanStatus.SKIPPED, scannedAt: expect.any(Date) }),
    }));
    expect(outboxCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        eventType: "storage.object_cleanup_requested",
        payload: expect.objectContaining({ bucket: "client-logos", objectPath: "old/logo.png" }),
      }),
    }));
    const clientEvent = outboxCreate.mock.calls.find(([call]) => call.data.eventType === "client.updated")?.[0].data.payload;
    expect(clientEventSchema.safeParse(clientEvent).success).toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });

  it("commits removal metadata before durable object cleanup instead of deleting Storage first", async () => {
    const outboxCreate = vi.fn().mockResolvedValue(undefined);
    const transaction = {
      client: { update: vi.fn().mockResolvedValue({ name: "Client", status: "ACTIVE", industry: null, mrr: { toString: () => "0" }, archivedAt: null }) },
      ownerAccount: { findUnique: vi.fn().mockResolvedValue({ id: "00000000-0000-4000-8000-000000000001" }) },
      fileMetadata: { update: vi.fn().mockResolvedValue(undefined) },
      auditEvent: { create: vi.fn().mockResolvedValue(undefined) },
      outboxEvent: { create: outboxCreate },
    };
    mocks.getDatabaseClient.mockReturnValue({
      client: { findFirst: vi.fn().mockResolvedValue({ logoFile: { id: "00000000-0000-4000-8000-000000000020", bucket: "client-logos", objectPath: "old/logo.png" } }) },
      $transaction: vi.fn((operation) => operation(transaction)),
    });
    const remove = vi.fn();
    mocks.createSupabaseAdminClient.mockReturnValue({ storage: { from: vi.fn(() => ({ remove })) } });

    await removeClientLogo("00000000-0000-4000-8000-000000000010", actor);

    expect(transaction.client.update).toHaveBeenCalled();
    expect(outboxCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ eventType: "storage.object_cleanup_requested", idempotencyKey: "storage:cleanup:00000000-0000-4000-8000-000000000020" }),
    }));
    expect(remove).not.toHaveBeenCalled();
  });
});
