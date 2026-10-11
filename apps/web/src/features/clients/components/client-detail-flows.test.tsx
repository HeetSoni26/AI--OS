import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ClientDeletionPlan, ClientDto, ProjectDto } from "@aios/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiveRegionProvider } from "@/components/ui";
import { ClientDeletion } from "./client-deletion";
import { ClientProjects } from "./client-projects";

const api = vi.hoisted(() => ({
  deletionState: vi.fn(),
  scheduleDeletion: vi.fn(),
  cancelDeletion: vi.fn(),
  projects: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  updateProjectStatus: vi.fn(),
  deleteProject: vi.fn(),
}));

vi.mock("../lib/client-api", () => ({ clientApi: api }));

const clientId = "10000000-0000-4000-8000-000000000001";
const projectId = "20000000-0000-4000-8000-000000000001";
const deletionId = "30000000-0000-4000-8000-000000000001";
const now = "2026-07-31T12:00:00.000Z";
const notBefore = "2026-08-07T12:00:00.000Z";
const impact = { clientId, items: [{ resourceType: "contacts", count: 2, deletionMode: "cascade" as const }], legalHold: false, blockers: [] };
const client: ClientDto = {
  id: clientId,
  name: "Acme Automation",
  industry: "Technology",
  status: "active",
  website: null,
  logoFileId: null,
  mrr: 1000,
  totalRevenue: 5000,
  startDate: "2026-01-01",
  primaryContactId: null,
  primaryContactName: null,
  projectCount: 0,
  contactCount: 2,
  archivedAt: now,
  createdAt: now,
  updatedAt: now,
  contactName: null,
  contactEmail: null,
  contactPhone: null,
  notes: null,
  deletedAt: null,
};
const plan: ClientDeletionPlan = { id: deletionId, clientId, status: "pending", requestedAt: now, notBefore, cancelledAt: null, completedAt: null, impact, version: 1 };
const project: ProjectDto = {
  id: projectId,
  clientId,
  name: "Owner workflow",
  type: "workflow",
  status: "planning",
  description: null,
  startDate: null,
  dueDate: null,
  price: null,
  hoursSpent: 0,
  taskCount: 0,
  deliverableCount: 0,
  archivedAt: null,
  createdAt: now,
  updatedAt: now,
};

function renderOwnerFlow(component: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><LiveRegionProvider>{component}</LiveRegionProvider></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("client detail destructive flow", () => {
  it("requires typed confirmation and impact acknowledgement, then supports undo", async () => {
    const user = userEvent.setup();
    api.deletionState.mockResolvedValue({ impact, plan: null });
    api.scheduleDeletion.mockResolvedValue(plan);
    api.cancelDeletion.mockResolvedValue({ ...plan, status: "cancelled", cancelledAt: now });
    renderOwnerFlow(<ClientDeletion client={client} />);

    await user.click(screen.getByRole("button", { name: "Schedule permanent deletion" }));
    expect(await screen.findByText("Deletion impact")).toBeInTheDocument();
    const schedule = screen.getByRole("button", { name: "Schedule deletion" });
    expect(schedule).toBeDisabled();

    await user.type(screen.getByLabelText(/Type DELETE/), `DELETE ${clientId}`);
    await user.click(screen.getByRole("checkbox"));
    expect(schedule).toBeEnabled();
    await user.click(schedule);

    expect(api.scheduleDeletion).toHaveBeenCalledWith(clientId, expect.objectContaining({ confirmation: `DELETE ${clientId}`, impactAcknowledged: true }));
    expect(await screen.findByText("Permanent deletion scheduled")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Undo reason"), "Owner changed their mind");
    await user.click(screen.getByRole("button", { name: "Cancel deletion and restore client" }));
    await waitFor(() => expect(api.cancelDeletion).toHaveBeenCalledWith(clientId, deletionId, "Owner changed their mind"));
  });
});

describe("client project flow", () => {
  it("creates a complete project payload from the accessible dialog", async () => {
    const user = userEvent.setup();
    api.projects.mockResolvedValueOnce([]).mockResolvedValue([project]);
    api.createProject.mockResolvedValue(project);
    renderOwnerFlow(<ClientProjects clientId={clientId} />);

    await user.click(await screen.findByRole("button", { name: "Create project" }));
    await user.type(screen.getByLabelText(/^Project name/), project.name);
    await user.selectOptions(screen.getByLabelText("Type"), "workflow");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Create project" }));

    await waitFor(() => expect(api.createProject).toHaveBeenCalledWith(clientId, {
      name: project.name,
      type: "workflow",
      status: "planning",
      description: null,
      startDate: null,
      dueDate: null,
      price: null,
    }));
    expect(await screen.findByText("Owner workflow")).toBeInTheDocument();
  });
});
