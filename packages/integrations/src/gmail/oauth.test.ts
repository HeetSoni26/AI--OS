import { describe, expect, it, vi } from "vitest";

import {
  createGmailAuthorizationUrl,
  createGmailOAuthState,
  exchangeGmailAuthorizationCode,
  GMAIL_READONLY_SCOPE,
  GmailProviderError,
  InMemoryOAuthStateNonceStore,
  parseGmailOAuthConfiguration,
  refreshGmailAccessToken,
  revokeGmailToken,
  verifyGmailOAuthState,
} from "./index";

const configuration = parseGmailOAuthConfiguration({
  clientId: "google-client-id",
  clientSecret: "google-client-secret",
  redirectUri: "https://app.example.test/oauth/gmail/callback",
  stateSigningSecret: "a-state-signing-secret-with-at-least-32-bytes",
});
const issuedAt = new Date("2026-07-31T12:00:00.000Z");
const context = { ownerId: "owner-1", sessionId: "session-1" };
const nonce = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";

describe("Gmail OAuth authorization and state", () => {
  it("generates a minimal readonly offline-consent authorization URL", async () => {
    const created = await createGmailOAuthState(
      configuration,
      new InMemoryOAuthStateNonceStore(),
      { ...context, now: issuedAt, nonce },
    );
    const url = createGmailAuthorizationUrl(configuration, {
      state: created.state,
      loginHint: " owner@example.com ",
    });

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("scope")).toBe(GMAIL_READONLY_SCOPE);
    expect(url.searchParams.getAll("scope")).toHaveLength(1);
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("include_granted_scopes")).toBe("false");
    expect(url.searchParams.get("login_hint")).toBe("owner@example.com");
  });

  it("verifies owner/session binding and consumes state exactly once", async () => {
    const store = new InMemoryOAuthStateNonceStore();
    const created = await createGmailOAuthState(configuration, store, {
      ...context,
      now: issuedAt,
      nonce,
    });

    await expect(verifyGmailOAuthState(configuration, store, {
      ...context,
      state: created.state,
      now: new Date("2026-07-31T12:01:00Z"),
    })).resolves.toMatchObject({ ...context, nonce });
    await expect(verifyGmailOAuthState(configuration, store, {
      ...context,
      state: created.state,
      now: new Date("2026-07-31T12:01:01Z"),
    })).rejects.toMatchObject({ kind: "conflict", providerCode: "state_replayed" });
  });

  it("rejects signed state presented by a different owner or session", async () => {
    const store = new InMemoryOAuthStateNonceStore();
    const created = await createGmailOAuthState(configuration, store, {
      ...context,
      now: issuedAt,
      nonce,
    });

    await expect(verifyGmailOAuthState(configuration, store, {
      ownerId: "owner-2",
      sessionId: context.sessionId,
      state: created.state,
      now: issuedAt,
    })).rejects.toMatchObject({ providerCode: "state_binding_mismatch" });
  });

  it("rejects state payload/signature tampering", async () => {
    const store = new InMemoryOAuthStateNonceStore();
    const created = await createGmailOAuthState(configuration, store, {
      ...context,
      now: issuedAt,
      nonce,
    });
    const [payload, signature] = created.state.split(".") as [string, string];
    const tamperedPayload = `${payload.slice(0, -1)}${payload.endsWith("A") ? "B" : "A"}`;
    const tamperedSignature = `${signature.slice(0, -1)}${signature.endsWith("A") ? "B" : "A"}`;

    await expect(verifyGmailOAuthState(configuration, store, {
      ...context,
      state: `${tamperedPayload}.${signature}`,
      now: issuedAt,
    })).rejects.toMatchObject({ providerCode: "invalid_state_signature" });
    await expect(verifyGmailOAuthState(configuration, store, {
      ...context,
      state: `${payload}.${tamperedSignature}`,
      now: issuedAt,
    })).rejects.toMatchObject({ providerCode: "invalid_state_signature" });
  });

  it("rejects expired state at the exact expiry boundary without consuming its nonce", async () => {
    const store = new InMemoryOAuthStateNonceStore();
    const created = await createGmailOAuthState(configuration, store, {
      ...context,
      now: issuedAt,
      nonce,
      ttlSeconds: 60,
    });

    await expect(verifyGmailOAuthState(configuration, store, {
      ...context,
      state: created.state,
      now: new Date("2026-07-31T12:01:00Z"),
    })).rejects.toMatchObject({ providerCode: "state_expired" });
  });
});

describe("Gmail OAuth HTTP operations", () => {
  it("exchanges a code with form encoding and normalizes tokens", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
      const parameters = new URLSearchParams(String(init?.body));
      expect(parameters.get("code")).toBe("one-time-code");
      expect(parameters.get("grant_type")).toBe("authorization_code");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response(JSON.stringify({
        access_token: "access-value",
        refresh_token: "refresh-value",
        expires_in: 3600,
        scope: GMAIL_READONLY_SCOPE,
        token_type: "Bearer",
      }), { status: 200, headers: { "content-type": "application/json" } });
    });

    const tokens = await exchangeGmailAuthorizationCode(configuration, {
      code: "one-time-code",
      fetch: fetchMock,
      now: issuedAt,
    });
    expect(tokens).toEqual({
      accessToken: "access-value",
      refreshToken: "refresh-value",
      expiresAt: new Date("2026-07-31T13:00:00Z"),
      scopes: [GMAIL_READONLY_SCOPE],
      tokenType: "Bearer",
    });
  });

  it("classifies invalid refresh grants as revoked without exposing provider details or tokens", async () => {
    const sensitiveToken = "sensitive-refresh-token";
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      error: "invalid_grant",
      error_description: `credential ${sensitiveToken} was revoked`,
    }), { status: 400, headers: { "content-type": "application/json" } }));

    let thrown: unknown;
    try {
      await refreshGmailAccessToken(configuration, {
        refreshToken: sensitiveToken,
        fetch: fetchMock,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(GmailProviderError);
    expect(thrown).toMatchObject({ kind: "revoked", retryable: false });
    expect(JSON.stringify(thrown)).not.toContain(sensitiveToken);
    expect(String(thrown)).not.toContain(sensitiveToken);
  });

  it("honors request timeouts", async () => {
    const fetchMock = vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("aborted", "AbortError"));
      }, { once: true });
    }));

    await expect(exchangeGmailAuthorizationCode(configuration, {
      code: "one-time-code",
      fetch: fetchMock,
      timeoutMs: 5,
    })).rejects.toMatchObject({ kind: "timeout", retryable: true });
  });

  it("honors caller cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
      if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
      return new Response(null, { status: 200 });
    });

    await expect(revokeGmailToken(configuration, {
      token: "credential",
      fetch: fetchMock,
      signal: controller.signal,
    })).rejects.toMatchObject({ kind: "cancelled", retryable: false });
  });

  it("revokes credentials using form data", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
      expect(new URLSearchParams(String(init?.body)).get("token")).toBe("credential");
      return new Response(null, { status: 200 });
    });
    await expect(revokeGmailToken(configuration, {
      token: "credential",
      fetch: fetchMock,
    })).resolves.toBeUndefined();
  });
});
