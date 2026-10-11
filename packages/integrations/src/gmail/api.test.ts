import { describe, expect, it, vi } from "vitest";

import { GmailApiClient, GmailProviderError } from "./index";

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

describe("Gmail API HTTP adapter", () => {
  it("pages history, requests only additions, and deduplicates message references", async () => {
    const providerFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(init?.headers).toMatchObject({ authorization: "Bearer access-credential" });
      expect(url.searchParams.get("historyTypes")).toBe("messageAdded");
      if (url.searchParams.get("pageToken") === null) {
        return json({
          historyId: "120",
          nextPageToken: "page-2",
          history: [{
            id: "110",
            messagesAdded: [
              { message: { id: "message-2", threadId: "thread-2" } },
              { message: { id: "message-1", threadId: "thread-1" } },
            ],
          }],
        });
      }
      expect(url.searchParams.get("pageToken")).toBe("page-2");
      return json({
        historyId: "130",
        history: [{
          id: "125",
          messagesAdded: [{ message: { id: "message-1", threadId: "thread-1" } }],
        }],
      });
    });
    const client = new GmailApiClient({ accessToken: "access-credential", fetch: providerFetch });

    const result = await client.readHistory({ startHistoryId: "100" });

    expect(providerFetch).toHaveBeenCalledTimes(2);
    expect(result.pages).toHaveLength(2);
    expect(result.addedMessages).toEqual([
      { providerMessageId: "message-1", providerThreadId: "thread-1" },
      { providerMessageId: "message-2", providerThreadId: "thread-2" },
    ]);
    expect(result.checkpointValue).toBe("130");
  });

  it("fetches message metadata without body payload", async () => {
    const providerFetch = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe("/gmail/v1/users/me/messages/message-1");
      expect(url.searchParams.get("format")).toBe("metadata");
      expect(url.searchParams.getAll("metadataHeaders")).toEqual([
        "From", "Sender", "Reply-To", "To", "Cc", "Bcc", "Subject", "Message-ID",
      ]);
      return json({
        id: "message-1",
        threadId: "thread-1",
        payload: { headers: [{ name: "Subject", value: "Safe metadata" }] },
      });
    });
    const client = new GmailApiClient({ accessToken: "access-credential", fetch: providerFetch });

    const message = await client.getMessageMetadata("message-1");

    expect(message.id).toBe("message-1");
    expect(message.payload).not.toHaveProperty("body");
  });

  it("rejects malformed history and repeated pagination tokens", async () => {
    const malformed = new GmailApiClient({
      accessToken: "access-credential",
      fetch: async () => json({ historyId: "not-a-number" }),
    });
    await expect(malformed.readHistory({ startHistoryId: "100" })).rejects.toMatchObject({
      kind: "validation",
      providerCode: "invalid_history_page",
    });

    const repeated = new GmailApiClient({
      accessToken: "access-credential",
      fetch: async () => json({ historyId: "101", nextPageToken: "same-page" }),
    });
    await expect(repeated.readHistory({ startHistoryId: "100" })).rejects.toMatchObject({
      kind: "transient",
      providerCode: "repeated_history_page_token",
    });
  });

  it.each([
    [401, {}, { kind: "revoked", retryable: false }],
    [429, { "retry-after": "12" }, { kind: "rate_limit", retryable: true, retryAfterMs: 12_000 }],
    [503, {}, { kind: "transient", retryable: true }],
  ] as const)("classifies HTTP %s safely", async (status, headers, expected) => {
    const client = new GmailApiClient({
      accessToken: "access-credential",
      fetch: async () => json({ error: { message: "must not be retained" } }, { status, headers }),
    });

    let failure: GmailProviderError | undefined;
    try {
      await client.getProfile();
    } catch (error) {
      failure = error as GmailProviderError;
    }
    expect(failure).toMatchObject(expected);
    expect(JSON.stringify(failure)).not.toContain("must not be retained");
    expect(JSON.stringify(failure)).not.toContain("access-credential");
  });
});
