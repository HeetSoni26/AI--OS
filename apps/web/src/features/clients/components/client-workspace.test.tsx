import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import type { ClientSummary } from "@aios/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiveRegionProvider } from "@/components/ui";
import { ApiClientError } from "@/lib/api-client";
import { clientApi } from "../lib/client-api";
import { ClientWorkspace } from "./client-workspace";

const navigation = vi.hoisted(() => ({ search: "", replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/clients",
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));
vi.mock("@/components/providers/context-panel-provider", () => ({ useContextPanel: vi.fn() }));
vi.mock("./client-detail", () => ({ ClientDetail: ({ clientId }: { clientId: string }) => <div>Detail {clientId}</div> }));
vi.mock("./gmail-status", () => ({ GmailStatusCard: () => <section aria-label="Gmail test status">Gmail status</section> }));
vi.mock("../lib/client-api", () => ({
  clientApi: {
    list: vi.fn(),
    create: vi.fn(),
    uploadLogo: vi.fn(),
  },
}));

const mockedList = vi.mocked(clientApi.list);
const mockedCreate = vi.mocked(clientApi.create);
const mockedUploadLogo = vi.mocked(clientApi.uploadLogo);
const atlas: ClientSummary = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Atlas Automation",
  industry: "Automation",
  status: "active",
  website: "https://atlas.example.com",
  logoFileId: null,
  mrr: 4000,
  totalRevenue: 48000,
  startDate: "2026-01-12",
  primaryContactId: null,
  primaryContactName: "Ari Atlas",
  projectCount: 3,
  contactCount: 2,
  archivedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-07-31T00:00:00.000Z",
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}><LiveRegionProvider>{children}</LiveRegionProvider></QueryClientProvider>;
}

function renderWorkspace() {
  return render(<ClientWorkspace />, { wrapper });
}

beforeEach(() => {
  navigation.search = "";
  navigation.replace.mockReset();
  mockedList.mockReset();
  mockedCreate.mockReset();
  mockedUploadLogo.mockReset();
  mockedList.mockResolvedValue({ items: [atlas], total: 1, hasMore: false, nextCursor: null });
});

describe("ClientWorkspace", () => {
  it("opens the create dialog with keyboard N but not while editing", async () => {
    renderWorkspace();
    await screen.findAllByText("Atlas Automation");

    fireEvent.keyDown(document, { key: "n" });
    expect(await screen.findByRole("dialog", { name: "New client" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    const search = screen.getByRole("searchbox", { name: "Search" });
    search.focus();
    fireEvent.keyDown(search, { key: "n" });
    expect(screen.queryByRole("dialog", { name: "New client" })).not.toBeInTheDocument();
  });

  it("provides labelled pressed-state status, industry, archive, and view filters", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await screen.findAllByText("Atlas Automation");

    expect(screen.getByRole("button", { name: "All statuses" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Active", pressed: false }));
    expect(navigation.replace).toHaveBeenLastCalledWith("/clients?status=active", { scroll: false });

    await user.click(screen.getByRole("button", { name: "All records" }));
    expect(navigation.replace).toHaveBeenLastCalledWith("/clients?archiveScope=all", { scroll: false });

    expect(screen.getByRole("searchbox", { name: "Search" })).toHaveAttribute("placeholder", "Fuzzy search client or contact name, email, industry, or notes…");
    fireEvent.change(screen.getByRole("textbox", { name: "Industry" }), { target: { value: "Automation" } });
    await waitFor(() => expect(navigation.replace).toHaveBeenLastCalledWith("/clients?industry=Automation", { scroll: false }), { timeout: 1000 });
    expect(screen.getByRole("button", { name: "List view" })).toHaveAttribute("aria-pressed", "true");
  });

  it("renders mobile stacked cards and the selected desktop view at the 768px breakpoint", async () => {
    renderWorkspace();
    await screen.findAllByText("Atlas Automation");

    expect(screen.getByTestId("client-mobile-cards")).toHaveClass("md:hidden");
    expect(screen.getByTestId("client-desktop-table")).toHaveClass("hidden", "md:block");
    expect(screen.getByTestId("client-mobile-cards").querySelector("button")).toBeInTheDocument();
    expect(screen.getAllByRole("region", { name: "Gmail test status" })[0]?.parentElement).toHaveClass("xl:hidden");
  });

  it("shows accessible loading and request-ID error states with retry", async () => {
    mockedList.mockReturnValueOnce(new Promise(() => undefined));
    const loading = renderWorkspace();
    expect(screen.getByText("Loading clients…")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Client results" })).toHaveAttribute("aria-busy", "true");
    loading.unmount();

    mockedList.mockRejectedValueOnce(new ApiClientError("UNAVAILABLE", "Directory unavailable.", 503, "req-client-list"));
    renderWorkspace();
    expect(await screen.findByText(/Request ID: req-client-list/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("keeps selected client state in the URL", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await screen.findAllByText("Atlas Automation");

    await user.click(screen.getAllByRole("button", { name: /Atlas Automation/ })[0]!);
    expect(navigation.replace).toHaveBeenLastCalledWith(`/clients?client=${atlas.id}`, { scroll: false });
    expect(await screen.findByRole("dialog", { name: "Client details" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close drawer" }));
    expect(navigation.replace).toHaveBeenLastCalledWith("/clients", { scroll: false });
  });

  it("offers usable cursor-history Previous and Next controls", async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValue({ items: [atlas], total: 40, hasMore: true, nextCursor: "cursor-page-2" });
    renderWorkspace();
    await screen.findByText("Showing 1 of 40 clients");

    const previous = screen.getByRole("button", { name: "Previous" });
    expect(previous).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(navigation.replace).toHaveBeenLastCalledWith("/clients?cursor=cursor-page-2", { scroll: false });
    expect(previous).toBeEnabled();

    await user.click(previous);
    expect(navigation.replace).toHaveBeenLastCalledWith("/clients", { scroll: false });
  });

  it("retains and opens a created client when the staged logo upload fails", async () => {
    const user = userEvent.setup();
    mockedCreate.mockResolvedValue({
      ...atlas,
      id: "22222222-2222-4222-8222-222222222222",
      name: "Northstar Labs",
      contactName: null,
      contactEmail: null,
      contactPhone: null,
      notes: null,
      deletedAt: null,
    });
    mockedUploadLogo.mockRejectedValue(new Error("The logo upload failed."));
    renderWorkspace();
    await screen.findAllByText("Atlas Automation");

    await user.click(screen.getByRole("button", { name: "New client" }));
    await user.type(screen.getByRole("textbox", { name: /Client name/ }), "Northstar Labs");
    const logo = new File(["image"], "northstar.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("Logo (optional)"), logo);
    await user.click(screen.getByRole("button", { name: "Create client and upload logo" }));

    await waitFor(() => expect(screen.getByText("Northstar Labs was created, but its logo was not uploaded. The logo upload failed.", { selector: "p" })).toHaveAttribute("role", "status"));
    expect(mockedUploadLogo).toHaveBeenCalledWith("22222222-2222-4222-8222-222222222222", logo);
    expect(navigation.replace).toHaveBeenLastCalledWith("/clients?client=22222222-2222-4222-8222-222222222222", { scroll: false });
    expect(await screen.findByRole("dialog", { name: "Client details" })).toBeInTheDocument();
  });
});
