import { describe, expect, it } from "vitest";

import {
  classifyGmailFailure,
  createGmailHistoryCheckpoint,
  GmailProviderError,
  normalizeGmailHistoryPage,
} from "./index";

describe("Gmail failure classification", () => {
  it.each([
    [{ status: 401 }, { kind: "revoked", retryable: false }],
    [{ oauthError: "invalid_grant" }, { kind: "revoked", retryable: false }],
    [{ status: 401, oauthError: "invalid_client" }, { kind: "authentication", retryable: false }],
    [{ status: 429, retryAfterMs: 1_000 }, { kind: "rate_limit", retryable: true }],
    [{ status: 403, reason: "userRateLimitExceeded" }, { kind: "rate_limit", retryable: true }],
    [{ status: 503 }, { kind: "transient", retryable: true }],
    [{ oauthError: "temporarily_unavailable" }, { kind: "transient", retryable: true }],
    [{ status: 400 }, { kind: "validation", retryable: false }],
  ] as const)("classifies %j", (input, expected) => {
    expect(classifyGmailFailure(input)).toMatchObject(expected);
  });

  it("drops unrecognized upstream codes instead of retaining arbitrary data", () => {
    expect(classifyGmailFailure({ status: 400, oauthError: "token-secret-value" }).providerCode)
      .toBeUndefined();
  });

  it("serializes only allow-listed safe details", () => {
    const error = new GmailProviderError("Safe message.", {
      kind: "rate_limit",
      retryable: true,
      status: 429,
      providerCode: "rateLimitExceeded",
      retryAfterMs: 2_000,
    });
    expect(error.toJSON()).toEqual({
      name: "GmailProviderError",
      message: "Safe message.",
      provider: "gmail",
      kind: "rate_limit",
      retryable: true,
      status: 429,
      providerCode: "rateLimitExceeded",
      retryAfterMs: 2_000,
    });
  });
});

describe("Gmail history and checkpoint contracts", () => {
  it("sorts history deterministically and exposes a checkpoint only on a final page", () => {
    const page = normalizeGmailHistoryPage({
      historyId: "200",
      history: [
        {
          id: "12",
          messagesAdded: [
            { message: { id: "m-2", threadId: "t-2" } },
            { message: { id: "m-1", threadId: "t-1" } },
            { message: { id: "m-1", threadId: "t-1" } },
          ],
          labelsAdded: [{
            message: { id: "m-1", threadId: "t-1" },
            labelIds: ["STARRED", "INBOX", "INBOX"],
          }],
        },
        { id: "9", messagesDeleted: [{ message: { id: "m-0", threadId: "t-0" } }] },
      ],
    }, { startHistoryId: "8" });

    expect(page.changes.map((change) => change.historyId)).toEqual(["9", "12"]);
    expect(page.changes[1]?.added.map((reference) => reference.providerMessageId)).toEqual([
      "m-1",
      "m-2",
    ]);
    expect(page.changes[1]?.labelsAdded[0]?.labelIds).toEqual(["INBOX", "STARRED"]);
    expect(page.checkpointCandidate).toBe("200");
    expect(createGmailHistoryCheckpoint("account-1", page, new Date("2026-07-31T12:00:00Z")))
      .toEqual({
        accountId: "account-1",
        historyId: "200",
        updatedAt: "2026-07-31T12:00:00.000Z",
      });
  });

  it("carries page tokens and prevents premature checkpointing", () => {
    const page = normalizeGmailHistoryPage({
      historyId: "200",
      nextPageToken: "next-page",
    }, { startHistoryId: "100", pageToken: "current-page", maxResults: 50 });

    expect(page).toMatchObject({
      requestedStartHistoryId: "100",
      requestedPageToken: "current-page",
      nextPageToken: "next-page",
    });
    expect(page.checkpointCandidate).toBeUndefined();
    expect(() => createGmailHistoryCheckpoint("account-1", page)).toThrowError(
      expect.objectContaining({ providerCode: "incomplete_history_page" }),
    );
  });
});
