import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDatabaseClient: vi.fn(),
  createClientOperationsService: vi.fn(),
  getOwner: vi.fn(),
}));

vi.mock("@aios/data", async (importOriginal) => ({
  ...await importOriginal() as Record<string, unknown>,
  getDatabaseClient: mocks.getDatabaseClient,
  createClientOperationsService: mocks.createClientOperationsService,
}));
vi.mock("@/lib/auth/guards", () => ({ getOwner: mocks.getOwner }));

import { GET, POST } from "./route";
import { resetMemoryApiRateLimits } from "@/lib/api/rate-limit";

const owner = { id: "7db01860-09c9-42c4-b993-283c5cfeb9d6", email: "owner@example.com", displayName: "Owner" };
const ownerRow = { id: "3f7760fe-b5c3-4f59-b1e0-884181ed99b3", authSubject: owner.id };
const clientId = "e11791d8-d71f-4ea9-a2e2-46bbeb10618d";
const now = new Date("2026-08-01T10:00:00.000Z");
const clientRow = {
  id: clientId,
  name: "Acme Automation",
  industry: "Automation",
  status: "ACTIVE",
  contactName: null,
  contactEmail: null,
  contactPhone: null,
  website: "https://acme.example",
  logoFileId: null,
  mrr: { toString: () => "1000.00" },
  totalRevenue: { toString: () => "5000.00" },
  startDate: new Date("2026-07-01T00:00:00.000Z"),
  notes: null,
  archivedAt: null,
  deletedAt: null,
  createdAt: now,
  updatedAt: now,
  contactCount: 0,
  projectCount: 0,
  contacts: [],
  projects: [],
};

function authenticatedRequest(url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("authorization", "Bearer test-token");
  headers.set("x-request-id", "req_client_route");
  return new Request(url, { ...init, headers });
}

describe("/api/v1/clients HTTP route", () => {
  const database = {
    ownerAccount: { findFirst: vi.fn() },
    contact: { findMany: vi.fn() },
    client: { count: vi.fn() },
  };
  const clients = {
    listClients: vi.fn(),
    createClient: vi.fn(),
    getClientDetail: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetMemoryApiRateLimits();
    mocks.getOwner.mockResolvedValue(owner);
    database.ownerAccount.findFirst.mockResolvedValue(ownerRow);
    database.contact.findMany.mockResolvedValue([]);
    database.client.count.mockResolvedValue(1);
    clients.listClients.mockResolvedValue({ items: [clientRow], nextCursor: null, hasMore: false });
    clients.createClient.mockResolvedValue(clientRow);
    clients.getClientDetail.mockResolvedValue(clientRow);
    mocks.getDatabaseClient.mockReturnValue(database);
    mocks.createClientOperationsService.mockReturnValue({ clients, work: {}, communications: {} });
  });

  it("lists authenticated clients with filters and normalized pagination metadata", async () => {
    const response = await GET(authenticatedRequest("http://localhost/api/v1/clients?status=active&sort=mrr&direction=desc&limit=10"));
    expect(response.status).toBe(200);
    expect(clients.listClients).toHaveBeenCalledWith(expect.objectContaining({ ownerAccountId: ownerRow.id }), expect.objectContaining({ status: ["ACTIVE"], sort: "mrr", order: "desc", limit: 10 }));
    expect(await response.json()).toMatchObject({
      data: { items: [{ id: clientId, status: "active", mrr: 1000 }], total: 1, hasMore: false },
      meta: { total: 1, requestId: "req_client_route" },
    });
  });

  it("creates a client through the transactional service and returns 201", async () => {
    const response = await POST(authenticatedRequest("http://localhost/api/v1/clients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Acme Automation", status: "active", website: "https://acme.example", mrr: 1000, totalRevenue: 5000, startDate: "2026-07-01" }),
    }));
    expect(response.status).toBe(201);
    expect(clients.createClient).toHaveBeenCalledWith(expect.objectContaining({ ownerSubject: owner.id }), expect.objectContaining({ status: "ACTIVE", startDate: new Date("2026-07-01T00:00:00.000Z") }));
    expect(await response.json()).toMatchObject({ data: { id: clientId, name: "Acme Automation" } });
  });

  it("returns 422 without touching data services for malformed input", async () => {
    const response = await POST(authenticatedRequest("http://localhost/api/v1/clients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "", website: "javascript:alert(1)" }),
    }));
    expect(response.status).toBe(422);
    expect(clients.createClient).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  });

  it("returns 401 before resolving database owner identity", async () => {
    mocks.getOwner.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/v1/clients"));
    expect(response.status).toBe(401);
    expect(database.ownerAccount.findFirst).not.toHaveBeenCalled();
  });
});
