import { describe, expect, it } from "vitest";

import {
  inferGmailMessageDirection,
  normalizeEmailAddress,
  normalizeGmailMessage,
  parseEmailAddressHeader,
  type GmailMessageParticipants,
} from "./index";

const account = {
  email: "Owner@Example.com",
  aliases: ["owner+agency@example.com", "o.w.n.e.r@example.com"],
};

function message(
  headers: { name: string; value: string }[],
  id = "message-1",
) {
  return {
    id,
    threadId: "thread-1",
    historyId: "123",
    internalDate: "1785513600000",
    labelIds: ["INBOX", "IMPORTANT", "INBOX"],
    payload: { mimeType: "multipart/alternative", headers },
  };
}

describe("email address parsing", () => {
  it("normalizes case while preserving plus aliases and dots", () => {
    expect(normalizeEmailAddress("  Sales.Team+North@Example.COM. ")).toBe(
      "sales.team+north@example.com",
    );
    expect(normalizeEmailAddress("salesteam@example.com")).not.toBe(
      normalizeEmailAddress("sales.team@example.com"),
    );
    expect(normalizeEmailAddress("sales@example.com")).not.toBe(
      normalizeEmailAddress("sales+crm@example.com"),
    );
  });

  it("parses quoted display names, comments, groups, and folded headers", () => {
    const parsed = parseEmailAddressHeader(
      'Team: "Doe, Jane" <Jane.Doe+Projects@Example.COM>,\r\n Bob (buyer) <bob@example.com>;',
    );

    expect(parsed.malformed).toBe(false);
    expect(parsed.addresses).toEqual([
      expect.objectContaining({
        normalized: "jane.doe+projects@example.com",
        displayName: "Doe, Jane",
      }),
      expect.objectContaining({
        normalized: "bob@example.com",
        displayName: "Bob",
      }),
    ]);
  });

  it("retains valid mailboxes while marking malformed segments", () => {
    const parsed = parseEmailAddressHeader(
      "good@example.com, broken@@example.com, Missing <missing@example.com",
    );

    expect(parsed.addresses.map((entry) => entry.normalized)).toEqual(["good@example.com"]);
    expect(parsed.malformed).toBe(true);
  });
});

describe("Gmail message normalization and direction", () => {
  it("normalizes metadata headers without retaining a raw body", () => {
    const normalized = normalizeGmailMessage(message([
      { name: "From", value: 'Client Person <client+ops@example.net>' },
      { name: "To", value: "Owner <OWNER@example.com>" },
      { name: "Cc", value: "another@example.net" },
      { name: "Subject", value: "Project\r\n update" },
      { name: "Message-ID", value: " <rfc-1@example.net> " },
    ]), account);

    expect(normalized).toMatchObject({
      provider: "gmail",
      providerMessageId: "message-1",
      providerThreadId: "thread-1",
      direction: "incoming",
      subject: "Project update",
      rfcMessageId: "<rfc-1@example.net>",
      labelIds: ["IMPORTANT", "INBOX"],
    });
    expect(normalized.participants.from[0]?.normalized).toBe("client+ops@example.net");
    expect(normalized).not.toHaveProperty("body");
    expect(normalized).not.toHaveProperty("raw");
  });

  it("marks malformed address headers without rejecting usable metadata", () => {
    const normalized = normalizeGmailMessage(message([
      { name: "From", value: "valid@example.net, invalid@@example.net" },
      { name: "To", value: "not-an-address" },
    ]), account);

    expect(normalized.participants.from.map((entry) => entry.normalized)).toEqual([
      "valid@example.net",
    ]);
    expect(normalized.participants.to).toEqual([]);
    expect(normalized.malformedHeaders).toEqual(["from", "to"]);
    expect(normalized.direction).toBe("unknown");
  });

  it.each([
    {
      title: "incoming mail",
      from: "client@example.net",
      to: "owner@example.com",
      expected: "incoming",
    },
    {
      title: "outgoing mail from a plus alias",
      from: "owner+agency@example.com",
      to: "client@example.net",
      expected: "outgoing",
    },
    {
      title: "mail entirely among connected aliases",
      from: "o.w.n.e.r@example.com",
      to: "owner@example.com",
      expected: "internal",
    },
    {
      title: "mail unrelated to the connected account",
      from: "a@example.net",
      to: "b@example.net",
      expected: "unknown",
    },
  ])("infers $title", ({ from, to, expected }) => {
    const normalized = normalizeGmailMessage(message([
      { name: "From", value: from },
      { name: "To", value: to },
    ]), account);
    expect(normalized.direction).toBe(expected);
  });

  it("uses Sender before From when inferring direction", () => {
    const normalized = normalizeGmailMessage(message([
      { name: "From", value: "delegated@example.net" },
      { name: "Sender", value: "owner@example.com" },
      { name: "To", value: "client@example.net" },
    ]), account);
    expect(normalized.direction).toBe("outgoing");
  });

  it("returns unknown for contradictory sender sets", () => {
    const parsed = (value: string) => parseEmailAddressHeader(value).addresses;
    const participants: GmailMessageParticipants = {
      from: parsed("owner@example.com, external@example.net"),
      sender: [],
      replyTo: [],
      to: parsed("owner@example.com, client@example.net"),
      cc: [],
      bcc: [],
    };
    expect(inferGmailMessageDirection(participants, account)).toBe("unknown");
  });
});
