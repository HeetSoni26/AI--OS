import "server-only";

import { createHash } from "node:crypto";
import { IdempotencyStatus, getDatabaseClient } from "@aios/data";
import type { OAuthStateNonceRecord, OAuthStateNonceStore, OAuthStateNonceConsumeResult } from "@aios/integrations/gmail";

function operation(record: OAuthStateNonceRecord): string {
  return `gmail.oauth.state:${createHash("sha256").update(record.sessionId).digest("hex").slice(0, 32)}`;
}

function fingerprint(record: OAuthStateNonceRecord): string {
  return createHash("sha256").update(`${record.ownerId}:${record.sessionId}:${record.expiresAt}`).digest("hex");
}

export class PrismaOAuthStateNonceStore implements OAuthStateNonceStore {
  async register(record: OAuthStateNonceRecord): Promise<void> {
    await getDatabaseClient().idempotencyRecord.create({
      data: {
        ownerSubject: record.ownerId,
        idempotencyKey: record.nonce,
        operation: operation(record),
        requestFingerprint: fingerprint(record),
        expiresAt: new Date(record.expiresAt * 1000),
      },
    });
  }

  async consume(record: OAuthStateNonceRecord): Promise<OAuthStateNonceConsumeResult> {
    return getDatabaseClient().$transaction(async (transaction) => {
      const found = await transaction.idempotencyRecord.findUnique({
        where: { ownerSubject_idempotencyKey_operation: { ownerSubject: record.ownerId, idempotencyKey: record.nonce, operation: operation(record) } },
      });
      if (!found) return "not_found";
      if (found.requestFingerprint !== fingerprint(record)) return "binding_mismatch";
      if (found.status === IdempotencyStatus.COMPLETED) return "already_consumed";
      await transaction.idempotencyRecord.update({ where: { id: found.id }, data: { status: IdempotencyStatus.COMPLETED } });
      return "consumed";
    });
  }
}
