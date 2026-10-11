import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ apiFetch }));

import { clientApi } from "./client-api";

const clientId = "10000000-0000-4000-8000-000000000001";
const projectId = "20000000-0000-4000-8000-000000000001";
const entityId = "30000000-0000-4000-8000-000000000001";

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockResolvedValue({ data: [] });
});

describe("client API adapter", () => {
  it("serializes directory filters and lifecycle routes", async () => {
    await clientApi.list({ limit: 25, archiveScope: "all", sort: "mrr", direction: "desc", view: "grid", cursor: "next", search: "acme", status: ["active", "paused"], industry: "Technology" });
    expect(apiFetch).toHaveBeenCalledWith("/api/v1/clients?limit=25&archiveScope=all&sort=mrr&direction=desc&view=grid&cursor=next&search=acme&industry=Technology&status=active&status=paused", undefined);

    await clientApi.detail(clientId);
    await clientApi.create({ name: "Acme", status: "prospect", mrr: 0, totalRevenue: 0 });
    await clientApi.update(clientId, { name: "Acme Updated" });
    await clientApi.archive(clientId);
    await clientApi.recover(clientId);
    expect(apiFetch).toHaveBeenCalledWith(`/api/v1/clients/${clientId}`, expect.objectContaining({ method: "PATCH" }));
    expect(apiFetch).toHaveBeenCalledWith(`/api/v1/clients/${clientId}`, expect.objectContaining({ method: "DELETE" }));
    expect(apiFetch).toHaveBeenCalledWith(`/api/v1/clients/${clientId}/recover`, expect.objectContaining({ method: "POST" }));
  });

  it("targets deletion, contact, communication, invoice, and logo resources", async () => {
    await clientApi.deletionImpact(clientId);
    await clientApi.scheduleDeletion(clientId, { confirmation: `DELETE ${clientId}`, impactAcknowledged: true });
    await clientApi.cancelDeletion(clientId, entityId);
    await clientApi.contacts(clientId);
    await clientApi.contact(clientId, entityId);
    await clientApi.createContact(clientId, { name: "Ada", isPrimary: true });
    await clientApi.updateContact(clientId, entityId, { phone: "+1 555 0100" });
    await clientApi.promoteContact(clientId, entityId);
    await clientApi.deleteContact(clientId, entityId);
    await clientApi.communications(clientId);
    await clientApi.createCommunication(clientId, { type: "note", direction: "internal", occurredAt: "2026-07-31T12:00:00.000Z", summary: "Owner note" });
    await clientApi.invoices(clientId);
    const logo = new File(["logo"], "logo.png", { type: "image/png" });
    await clientApi.uploadLogo(clientId, logo);
    await clientApi.deleteLogo(clientId);

    expect(apiFetch).toHaveBeenCalledWith(`/api/v1/clients/${clientId}/deletion`, undefined);
    expect(apiFetch).toHaveBeenCalledWith(`/api/v1/clients/${clientId}/contacts/${entityId}`, undefined);
    expect(apiFetch).toHaveBeenCalledWith(`/api/v1/clients/${clientId}/contacts/${entityId}`, expect.objectContaining({ method: "PATCH" }));
    expect(apiFetch).toHaveBeenCalledWith(`/api/v1/clients/${clientId}/communications?limit=100&order=reverse_chronological`, undefined);
    expect(apiFetch).toHaveBeenCalledWith(`/api/v1/clients/${clientId}/logo`, expect.objectContaining({ method: "POST", body: logo }));
  });

  it("targets every nested project work resource", async () => {
    await clientApi.projects(clientId);
    await clientApi.project(clientId, projectId);
    await clientApi.createProject(clientId, { name: "Build", type: "workflow", status: "planning" });
    await clientApi.updateProject(clientId, projectId, { description: "Updated" });
    await clientApi.updateProjectStatus(clientId, projectId, "review", "Ready");
    await clientApi.deleteProject(clientId, projectId);
    await clientApi.tasks(clientId, projectId);
    await clientApi.createTask(clientId, projectId, { title: "Review", status: "todo", priority: "medium" });
    await clientApi.updateTask(clientId, projectId, entityId, { status: "done" });
    await clientApi.deleteTask(clientId, projectId, entityId);
    await clientApi.assignments(clientId, projectId);
    await clientApi.createAssignment(clientId, projectId, { assigneeType: "human", taskId: entityId });
    await clientApi.updateAssignment(clientId, projectId, entityId, { role: "Reviewer" });
    await clientApi.deleteAssignment(clientId, projectId, entityId);
    await clientApi.projectTime(clientId, projectId);
    await clientApi.createManualTimeEntry(clientId, projectId, { startedAt: "2026-07-31T10:00:00.000Z", endedAt: "2026-07-31T11:00:00.000Z", minutes: 60 });
    await clientApi.updateManualTimeEntry(clientId, projectId, entityId, { minutes: 30 });
    await clientApi.deleteManualTimeEntry(clientId, projectId, entityId);
    await clientApi.deliverables(clientId, projectId);
    await clientApi.createDeliverable(clientId, projectId, { title: "Approval", position: 1, isRequired: true });
    await clientApi.updateDeliverable(clientId, projectId, entityId, { completedAt: "2026-07-31T12:00:00.000Z" });
    await clientApi.deleteDeliverable(clientId, projectId, entityId);
    await clientApi.reorderDeliverables(clientId, projectId, [entityId]);

    const base = `/api/v1/clients/${clientId}/projects/${projectId}`;
    expect(apiFetch).toHaveBeenCalledWith(`${base}/tasks/${entityId}`, expect.objectContaining({ method: "PATCH" }));
    expect(apiFetch).toHaveBeenCalledWith(`${base}/assignments`, expect.objectContaining({ method: "POST" }));
    expect(apiFetch).toHaveBeenCalledWith(`${base}/time/${entityId}`, expect.objectContaining({ method: "DELETE" }));
    expect(apiFetch).toHaveBeenCalledWith(`${base}/deliverables/reorder`, expect.objectContaining({ method: "PATCH" }));
  });
});
