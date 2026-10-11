import { z } from "zod";

import { GmailProviderError } from "./errors";

const historyIdSchema = z.string().regex(/^\d+$/u);
const gmailHistoryMessageSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().min(1),
});
const gmailHistoryMessageChangeSchema = z.object({ message: gmailHistoryMessageSchema });
const gmailHistoryLabelChangeSchema = z.object({
  message: gmailHistoryMessageSchema,
  labelIds: z.array(z.string()),
});

export const gmailApiHistoryRecordSchema = z.object({
  id: historyIdSchema,
  messages: z.array(gmailHistoryMessageSchema).optional(),
  messagesAdded: z.array(gmailHistoryMessageChangeSchema).optional(),
  messagesDeleted: z.array(gmailHistoryMessageChangeSchema).optional(),
  labelsAdded: z.array(gmailHistoryLabelChangeSchema).optional(),
  labelsRemoved: z.array(gmailHistoryLabelChangeSchema).optional(),
});

export const gmailApiHistoryPageSchema = z.object({
  history: z.array(gmailApiHistoryRecordSchema).optional(),
  nextPageToken: z.string().min(1).optional(),
  historyId: historyIdSchema,
});

export type GmailApiHistoryPage = z.infer<typeof gmailApiHistoryPageSchema>;

export const gmailHistoryPageRequestSchema = z.object({
  startHistoryId: historyIdSchema,
  pageToken: z.string().min(1).optional(),
  maxResults: z.number().int().positive().max(500).default(100),
});

export type GmailHistoryPageRequest = z.infer<typeof gmailHistoryPageRequestSchema>;
export type GmailHistoryPageRequestInput = z.input<typeof gmailHistoryPageRequestSchema>;

export interface GmailHistoryMessageReference {
  readonly providerMessageId: string;
  readonly providerThreadId: string;
}

export interface GmailHistoryChange {
  readonly historyId: string;
  readonly added: readonly GmailHistoryMessageReference[];
  readonly deleted: readonly GmailHistoryMessageReference[];
  readonly labelsAdded: readonly (GmailHistoryMessageReference & { readonly labelIds: readonly string[] })[];
  readonly labelsRemoved: readonly (GmailHistoryMessageReference & { readonly labelIds: readonly string[] })[];
}

export interface GmailHistoryPage {
  readonly requestedStartHistoryId: string;
  readonly requestedPageToken?: string;
  readonly latestHistoryId: string;
  readonly changes: readonly GmailHistoryChange[];
  readonly nextPageToken?: string;
  /** Checkpoint may only advance when the final page has been durably handled. */
  readonly checkpointCandidate?: string;
}

export const gmailHistoryCheckpointSchema = z.object({
  accountId: z.string().min(1),
  historyId: historyIdSchema,
  updatedAt: z.iso.datetime({ offset: true }),
});

export type GmailHistoryCheckpoint = z.infer<typeof gmailHistoryCheckpointSchema>;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeReferences(
  changes: readonly z.infer<typeof gmailHistoryMessageChangeSchema>[] | undefined,
): GmailHistoryMessageReference[] {
  const byId = new Map<string, GmailHistoryMessageReference>();
  for (const change of changes ?? []) {
    byId.set(change.message.id, {
      providerMessageId: change.message.id,
      providerThreadId: change.message.threadId,
    });
  }
  return [...byId.values()].sort((left, right) =>
    compareText(left.providerMessageId, right.providerMessageId) ||
    compareText(left.providerThreadId, right.providerThreadId),
  );
}

function normalizeLabelReferences(
  changes: readonly z.infer<typeof gmailHistoryLabelChangeSchema>[] | undefined,
): (GmailHistoryMessageReference & { readonly labelIds: readonly string[] })[] {
  return (changes ?? [])
    .map((change) => ({
      providerMessageId: change.message.id,
      providerThreadId: change.message.threadId,
      labelIds: [...new Set(change.labelIds)].sort(compareText),
    }))
    .sort((left, right) =>
      compareText(left.providerMessageId, right.providerMessageId) ||
      compareText(left.providerThreadId, right.providerThreadId) ||
      compareText(left.labelIds.join("\u0000"), right.labelIds.join("\u0000")),
    );
}

/** Normalizes one Gmail history response without advancing persisted state. */
export function normalizeGmailHistoryPage(
  input: unknown,
  requestInput: GmailHistoryPageRequestInput,
): GmailHistoryPage {
  const response = gmailApiHistoryPageSchema.safeParse(input);
  const request = gmailHistoryPageRequestSchema.safeParse(requestInput);
  if (!response.success || !request.success) {
    throw new GmailProviderError("Gmail history page is invalid.", {
      kind: "validation",
      retryable: false,
      providerCode: "invalid_history_page",
    });
  }

  const changes = (response.data.history ?? [])
    .map((record): GmailHistoryChange => ({
      historyId: record.id,
      added: normalizeReferences(record.messagesAdded),
      deleted: normalizeReferences(record.messagesDeleted),
      labelsAdded: normalizeLabelReferences(record.labelsAdded),
      labelsRemoved: normalizeLabelReferences(record.labelsRemoved),
    }))
    .sort((left, right) => {
      const leftId = BigInt(left.historyId);
      const rightId = BigInt(right.historyId);
      return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
    });

  return {
    requestedStartHistoryId: request.data.startHistoryId,
    ...(request.data.pageToken === undefined ? {} : { requestedPageToken: request.data.pageToken }),
    latestHistoryId: response.data.historyId,
    changes,
    ...(response.data.nextPageToken === undefined
      ? { checkpointCandidate: response.data.historyId }
      : { nextPageToken: response.data.nextPageToken }),
  };
}

/** Creates a checkpoint after the caller has durably applied a final page. */
export function createGmailHistoryCheckpoint(
  accountId: string,
  finalPage: GmailHistoryPage,
  updatedAt = new Date(),
): GmailHistoryCheckpoint {
  if (finalPage.checkpointCandidate === undefined || finalPage.nextPageToken !== undefined) {
    throw new GmailProviderError("Gmail history checkpoint requires a final page.", {
      kind: "conflict",
      retryable: false,
      providerCode: "incomplete_history_page",
    });
  }
  const checkpoint = gmailHistoryCheckpointSchema.safeParse({
    accountId,
    historyId: finalPage.checkpointCandidate,
    updatedAt: updatedAt.toISOString(),
  });
  if (!checkpoint.success) {
    throw new GmailProviderError("Gmail history checkpoint is invalid.", {
      kind: "validation",
      retryable: false,
      providerCode: "invalid_history_checkpoint",
    });
  }
  return checkpoint.data;
}
