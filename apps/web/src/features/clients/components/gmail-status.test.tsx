import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { GmailStatusCard } from "./gmail-status";

vi.mock("@/lib/api-client", () => {
  class MockApiClientError extends Error {
    constructor(
      readonly code: string,
      message: string,
      readonly status: number,
      readonly requestId?: string,
    ) {
      super(message);
    }
  }
  return { apiFetch: vi.fn(), ApiClientError: MockApiClientError };
});

const mockedApiFetch = vi.mocked(apiFetch);
const connected = {
  configured: true,
  connection: {
    id: "gmail-1",
    name: "Gmail",
    status: "connected",
    account: "owner@example.com",
    connectedAt: "2026-07-31T12:00:00.000Z",
    sync: { status: "idle", lastSyncedAt: "2026-07-31T13:00:00.000Z", nextRetryAt: null, lastErrorCode: null },
  },
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderStatus(data: unknown) {
  mockedApiFetch.mockResolvedValue({ data } as never);
  return render(<GmailStatusCard />, { wrapper });
}

describe("GmailStatusCard", () => {
  beforeEach(() => mockedApiFetch.mockReset());

  it("renders an explicit loading state", async () => {
    let resolveStatus!: (value: unknown) => void;
    mockedApiFetch.mockReturnValue(new Promise((resolve) => { resolveStatus = resolve; }) as never);
    const view = render(<GmailStatusCard />, { wrapper });
    expect(screen.getByText("Checking Gmail status…")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Gmail ingestion" })).toHaveAttribute("aria-busy", "true");
    resolveStatus({ data: { configured: false, connection: null } });
    expect(await screen.findByText("Not configured")).toBeInTheDocument();
    view.unmount();
  });

  it("renders a request-ID error and retries status", async () => {
    const user = userEvent.setup();
    mockedApiFetch
      .mockRejectedValueOnce(new ApiClientError("UNAVAILABLE", "Gmail status failed.", 503, "req-gmail-1"))
      .mockResolvedValueOnce({ data: { configured: false, connection: null } } as never);
    render(<GmailStatusCard />, { wrapper });

    expect(await screen.findByText(/Request ID: req-gmail-1/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Retry status/ }));
    expect(await screen.findByText("Not configured")).toBeInTheDocument();
  });

  it.each([
    [{ configured: false, connection: null }, "Not configured", null],
    [{ configured: true, connection: null }, "Not connected", "Connect Gmail"],
    [connected, "Connected", "Request sync"],
    [{ ...connected, connection: { ...connected.connection, status: "revoked" } }, "Authorization revoked", "Reconnect Gmail"],
    [{ ...connected, connection: { ...connected.connection, sync: { ...connected.connection.sync, status: "rate_limited", nextRetryAt: "2026-08-01T13:00:00.000Z" } } }, "Rate limited", "Retry sync"],
    [{ ...connected, connection: { ...connected.connection, sync: { ...connected.connection.sync, status: "error", lastErrorCode: "gmail_timeout" } } }, "Sync failed", "Retry sync"],
    [{ ...connected, connection: { ...connected.connection, sync: { ...connected.connection.sync, status: "running" } } }, "Syncing", "Sync in progress"],
  ])("handles Gmail state %#", async (data, label, action) => {
    renderStatus(data);
    expect(await screen.findByText(label)).toBeInTheDocument();
    if (action) expect(screen.getByRole("button", { name: action })).toBeInTheDocument();
    else expect(screen.queryByRole("button", { name: /Connect Gmail/ })).not.toBeInTheDocument();
  });

  it("announces a sync request outcome and refreshes status", async () => {
    const user = userEvent.setup();
    mockedApiFetch
      .mockResolvedValueOnce({ data: connected } as never)
      .mockResolvedValueOnce({ data: { accepted: false, connectionId: "gmail-1", status: "worker_not_started", message: "Synchronization was queued for the durable worker." } } as never)
      .mockResolvedValueOnce({ data: connected } as never);
    render(<GmailStatusCard />, { wrapper });

    await user.click(await screen.findByRole("button", { name: "Request sync" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Synchronization was queued for the durable worker.");
    await waitFor(() => expect(mockedApiFetch).toHaveBeenCalledWith("/api/v1/integrations/gmail/sync", { method: "POST" }));
  });

  it("shows announced reconnect failure with its request ID", async () => {
    const user = userEvent.setup();
    mockedApiFetch
      .mockResolvedValueOnce({ data: { ...connected, connection: { ...connected.connection, status: "revoked" } } } as never)
      .mockRejectedValueOnce(new ApiClientError("OAUTH_FAILED", "Reconnect failed.", 503, "req-reconnect"));
    render(<GmailStatusCard />, { wrapper });

    await user.click(await screen.findByRole("button", { name: "Reconnect Gmail" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Reconnect failed. Request ID: req-reconnect.");
  });
});
