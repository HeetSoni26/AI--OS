import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CommunicationDto, ContactDto } from "@aios/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiveRegionProvider } from "@/components/ui";
import { ClientCommunications } from "./client-communications";
import { ClientContacts } from "./client-contacts";

const api = vi.hoisted(() => ({
  contacts: vi.fn(),
  createContact: vi.fn(),
  updateContact: vi.fn(),
  promoteContact: vi.fn(),
  deleteContact: vi.fn(),
  communications: vi.fn(),
  createCommunication: vi.fn(),
}));
vi.mock("../lib/client-api", () => ({ clientApi: api }));

const clientId = "10000000-0000-4000-8000-000000000001";
const now = "2026-07-31T12:00:00.000Z";
const ada: ContactDto = {
  id: "20000000-0000-4000-8000-000000000001",
  clientId,
  name: "Ada Owner",
  role: "Sponsor",
  email: "ada@example.invalid",
  phone: "+1 555 0100",
  notes: "Prefers concise updates.",
  isPrimary: true,
  lastContactAt: now,
  archivedAt: null,
  createdAt: now,
  updatedAt: now,
};
const grace: ContactDto = { ...ada, id: "20000000-0000-4000-8000-000000000002", name: "Grace Reviewer", email: "grace@example.invalid", isPrimary: false };
const communication: CommunicationDto = {
  id: "30000000-0000-4000-8000-000000000001",
  clientId,
  contactId: ada.id,
  type: "email",
  direction: "inbound",
  occurredAt: now,
  summary: "Approved the first delivery milestone.",
  body: "Proceed with the reviewed configuration.",
  nextAction: "Start implementation",
  source: "gmail",
  providerMessageId: "provider-1",
  archivedAt: null,
  createdAt: now,
  updatedAt: now,
};

function renderRelation(node: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><LiveRegionProvider>{node}</LiveRegionProvider></QueryClientProvider>);
}

beforeEach(() => vi.clearAllMocks());

describe("client contacts", () => {
  it("creates, promotes, edits, and deletes owner contacts from accessible dialogs", async () => {
    const user = userEvent.setup();
    api.contacts.mockResolvedValue([ada, grace]);
    api.createContact.mockResolvedValue({ ...grace, id: "20000000-0000-4000-8000-000000000003", name: "New Contact" });
    api.promoteContact.mockResolvedValue({ ...grace, isPrimary: true });
    api.updateContact.mockResolvedValue({ ...grace, role: "Decision maker" });
    api.deleteContact.mockResolvedValue(grace);
    renderRelation(<ClientContacts clientId={clientId} />);

    expect(await screen.findByText("Ada Owner")).toBeInTheDocument();
    expect(screen.getAllByText("Prefers concise updates.")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Add contact" }));
    await user.type(screen.getByLabelText(/^Name/), "New Contact");
    await user.type(screen.getByLabelText("Email"), "new@example.invalid");
    await user.type(screen.getByLabelText("Phone"), "+1 555 0199");
    await user.type(screen.getByLabelText("Notes"), "Synthetic contact note");
    await user.click(screen.getByRole("checkbox", { name: "Use as the primary client contact" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save contact" }));
    await waitFor(() => expect(api.createContact).toHaveBeenCalledWith(clientId, expect.objectContaining({ name: "New Contact", isPrimary: true })));

    await user.click(screen.getByRole("button", { name: "Make primary" }));
    await waitFor(() => expect(api.promoteContact).toHaveBeenCalledWith(clientId, grace.id));
    await user.click(screen.getAllByRole("button", { name: "Edit" })[1]!);
    const role = screen.getByLabelText("Role");
    await user.clear(role);
    await user.type(role, "Decision maker");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save contact" }));
    await waitFor(() => expect(api.updateContact).toHaveBeenCalledWith(clientId, grace.id, expect.objectContaining({ role: "Decision maker" })));

    await user.click(screen.getAllByRole("button", { name: "Delete" })[1]!);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete contact" }));
    await waitFor(() => expect(api.deleteContact).toHaveBeenCalledWith(clientId, grace.id));
  }, 10_000);
});

describe("client communications", () => {
  it("renders source metadata and logs a manual communication", async () => {
    const user = userEvent.setup();
    api.communications.mockResolvedValue([communication]);
    api.contacts.mockResolvedValue([ada]);
    api.createCommunication.mockResolvedValue({ ...communication, id: "30000000-0000-4000-8000-000000000002", source: "manual" });
    renderRelation(<ClientCommunications clientId={clientId} />);

    expect(await screen.findByText(communication.summary)).toBeInTheDocument();
    expect(screen.getByText("gmail")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Log" }));
    await user.selectOptions(screen.getByLabelText("Type"), "call_summary");
    await user.selectOptions(screen.getByLabelText("Direction"), "outbound");
    await user.selectOptions(screen.getByLabelText("Contact"), ada.id);
    fireEvent.change(screen.getByLabelText(/^Date and time/), { target: { value: "2026-07-31T14:30" } });
    await user.type(screen.getByLabelText(/^Summary/), "Discussed rollout timing");
    await user.type(screen.getByLabelText("Body"), "Synthetic call notes");
    await user.type(screen.getByLabelText("Next action"), "Send the launch plan");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save communication" }));

    await waitFor(() => expect(api.createCommunication).toHaveBeenCalledWith(clientId, expect.objectContaining({
      contactId: ada.id,
      type: "call_summary",
      direction: "outbound",
      summary: "Discussed rollout timing",
      source: "manual",
    })));
  });
});
