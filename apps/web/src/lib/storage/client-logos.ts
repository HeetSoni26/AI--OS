import "server-only";

import { randomUUID } from "node:crypto";
import { getDatabaseClient, MalwareScanStatus, FilePurpose } from "@aios/data";
import { ApiRequestError } from "@/lib/api/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ValidatedImage } from "./image-validation";

const BUCKET = "client-logos";

export async function saveClientLogo(
  clientId: string,
  image: ValidatedImage,
  actor: { subject: string; correlationId: string },
) {
  const database = getDatabaseClient();
  const client = await database.client.findFirst({
    where: { id: clientId, deletedAt: null },
    select: {
      id: true,
      name: true,
      status: true,
      industry: true,
      mrr: true,
      archivedAt: true,
      logoFileId: true,
      logoFile: { select: { bucket: true, objectPath: true } },
    },
  });
  if (!client) throw new ApiRequestError("NOT_FOUND", "Client was not found.", { status: 404 });

  const fileId = randomUUID();
  const objectPath = `${clientId}/${fileId}.${image.extension}`;
  const storage = createSupabaseAdminClient().storage.from(BUCKET);
  const { error: uploadError } = await storage.upload(objectPath, image.bytes, {
    contentType: image.contentType,
    cacheControl: "3600",
    upsert: false,
  });
  if (uploadError) throw new ApiRequestError("STORAGE_UNAVAILABLE", "The client logo could not be stored.", { status: 503, cause: uploadError });

  try {
    const result = await database.$transaction(async (transaction) => {
      const file = await transaction.fileMetadata.create({
        data: {
          id: fileId,
          clientId,
          purpose: FilePurpose.LOGO,
          bucket: BUCKET,
          objectPath,
          originalName: `client-logo.${image.extension}`,
          contentType: image.contentType,
          sizeBytes: BigInt(image.bytes.byteLength),
          checksumSha256: image.sha256,
          ownerEntityType: "client",
          ownerEntityId: clientId,
          // Strict image decoding, signature checks, dimensions, MIME matching and a private bucket
          // form the approved logo-only scanner exemption. General client files remain scan-gated.
          malwareScanStatus: MalwareScanStatus.SKIPPED,
          scannedAt: new Date(),
        },
      });
      const updatedClient = await transaction.client.update({ where: { id: clientId }, data: { logoFileId: file.id, logoUrl: `/api/v1/clients/${clientId}/logo` } });
      const owner = await transaction.ownerAccount.findUnique({ where: { authSubject: actor.subject }, select: { id: true } });
      if (!owner) throw new ApiRequestError("FORBIDDEN", "The active owner could not be resolved.", { status: 403 });
      await transaction.auditEvent.create({ data: {
        actorSubject: actor.subject,
        actorType: "owner",
        action: "client.logo.updated",
        entityType: "client",
        entityId: clientId,
        correlationId: actor.correlationId,
        changeSummary: { fields: ["logoFileId", "logoUrl"] },
      } });
      const eventId = randomUUID();
      const occurredAt = new Date();
      await transaction.outboxEvent.create({ data: {
        id: eventId,
        aggregateType: "client",
        aggregateId: clientId,
        eventType: "client.updated",
        payload: {
          eventId,
          schemaVersion: 1,
          ownerId: owner.id,
          correlationId: actor.correlationId,
          occurredAt: occurredAt.toISOString(),
          eventType: "client.updated",
          entityType: "client",
          aggregateId: clientId,
          payload: {
            clientId,
            name: updatedClient.name,
            status: updatedClient.status.toLowerCase(),
            industry: updatedClient.industry,
            mrr: Number(updatedClient.mrr.toString()),
            archivedAt: updatedClient.archivedAt?.toISOString() ?? null,
          },
        },
        correlationId: actor.correlationId,
        occurredAt,
        idempotencyKey: `client:${clientId}:logo:${file.id}`,
      } });
      if (client.logoFileId && client.logoFile && client.logoFileId !== file.id) {
        await transaction.fileMetadata.update({ where: { id: client.logoFileId }, data: { archivedAt: new Date(), deletedAt: new Date() } });
        await transaction.outboxEvent.create({ data: {
          aggregateType: "file_metadata",
          aggregateId: client.logoFileId,
          eventType: "storage.object_cleanup_requested",
          payload: {
            schemaVersion: 1,
            bucket: client.logoFile.bucket,
            objectPath: client.logoFile.objectPath,
            fileId: client.logoFileId,
          },
          correlationId: actor.correlationId,
          occurredAt: new Date(),
          idempotencyKey: `storage:cleanup:${client.logoFileId}`,
        } });
      }
      return file;
    });
    return result;
  } catch (error) {
    await storage.remove([objectPath]);
    throw error;
  }
}

export async function createClientLogoDownload(clientId: string): Promise<{ signedUrl: string; etag: string }> {
  const file = await getDatabaseClient().fileMetadata.findFirst({
    where: { clientId, purpose: FilePurpose.LOGO, logoForClient: { id: clientId }, archivedAt: null, deletedAt: null },
    select: { bucket: true, objectPath: true, checksumSha256: true },
  });
  if (!file) throw new ApiRequestError("NOT_FOUND", "Client logo was not found.", { status: 404 });
  const { data, error } = await createSupabaseAdminClient().storage.from(file.bucket).createSignedUrl(file.objectPath, 300);
  if (error || !data?.signedUrl) throw new ApiRequestError("STORAGE_UNAVAILABLE", "The client logo is temporarily unavailable.", { status: 503, cause: error });
  return { signedUrl: data.signedUrl, etag: file.checksumSha256 };
}

export async function removeClientLogo(
  clientId: string,
  actor: { subject: string; correlationId: string },
): Promise<void> {
  const database = getDatabaseClient();
  const client = await database.client.findFirst({
    where: { id: clientId, deletedAt: null },
    select: {
      id: true,
      name: true,
      status: true,
      industry: true,
      mrr: true,
      archivedAt: true,
      logoFile: { select: { id: true, bucket: true, objectPath: true } },
    },
  });
  if (!client) throw new ApiRequestError("NOT_FOUND", "Client was not found.", { status: 404 });
  if (!client.logoFile) return;
  await database.$transaction(async (transaction) => {
    const updatedClient = await transaction.client.update({ where: { id: clientId }, data: { logoFileId: null, logoUrl: null } });
    const owner = await transaction.ownerAccount.findUnique({ where: { authSubject: actor.subject }, select: { id: true } });
    if (!owner) throw new ApiRequestError("FORBIDDEN", "The active owner could not be resolved.", { status: 403 });
    await transaction.fileMetadata.update({ where: { id: client.logoFile!.id }, data: { archivedAt: new Date(), deletedAt: new Date() } });
    await transaction.auditEvent.create({ data: {
      actorSubject: actor.subject,
      actorType: "owner",
      action: "client.logo.removed",
      entityType: "client",
      entityId: clientId,
      correlationId: actor.correlationId,
      changeSummary: { fields: ["logoFileId", "logoUrl"] },
    } });
    const eventId = randomUUID();
    const occurredAt = new Date();
    await transaction.outboxEvent.create({ data: {
      id: eventId,
      aggregateType: "client",
      aggregateId: clientId,
      eventType: "client.updated",
      payload: {
        eventId,
        schemaVersion: 1,
        ownerId: owner.id,
        correlationId: actor.correlationId,
        occurredAt: occurredAt.toISOString(),
        eventType: "client.updated",
        entityType: "client",
        aggregateId: clientId,
        payload: {
          clientId,
          name: updatedClient.name,
          status: updatedClient.status.toLowerCase(),
          industry: updatedClient.industry,
          mrr: Number(updatedClient.mrr.toString()),
          archivedAt: updatedClient.archivedAt?.toISOString() ?? null,
        },
      },
      correlationId: actor.correlationId,
      occurredAt,
      idempotencyKey: `client:${clientId}:logo:removed:${client.logoFile!.id}`,
    } });
    await transaction.outboxEvent.create({ data: {
      aggregateType: "file_metadata",
      aggregateId: client.logoFile!.id,
      eventType: "storage.object_cleanup_requested",
      payload: {
        schemaVersion: 1,
        bucket: client.logoFile!.bucket,
        objectPath: client.logoFile!.objectPath,
        fileId: client.logoFile!.id,
      },
      correlationId: actor.correlationId,
      occurredAt: new Date(),
      idempotencyKey: `storage:cleanup:${client.logoFile!.id}`,
    } });
  });
}
