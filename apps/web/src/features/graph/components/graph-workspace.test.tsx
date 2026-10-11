import { forwardRef, useImperativeHandle, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GraphDirectoryResponse, GraphResponse, NodeData } from "@aios/contracts";
import type * as GraphApiModule from "../lib/graph-api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiveRegionProvider } from "@/components/ui";
import { graphApi } from "../lib/graph-api";
import { GraphWorkspace } from "./graph-workspace";

const navigation = vi.hoisted(() => ({ search: "", replace: vi.fn(), push: vi.fn() }));
const shell = vi.hoisted(() => ({ command: null as null | { invoke: () => void; buttonLabel: string; buttonText: string } }));
const context = vi.hoisted(() => ({ panel: null as ReactNode }));
const realtime = vi.hoisted(() => ({ status: "unconfigured" as "connected" | "reconnecting" | "unavailable" | "unconfigured" }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/knowledge-graph",
  useRouter: () => ({ replace: navigation.replace, push: navigation.push }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));
vi.mock("@/components/providers/command-registration-provider", () => ({
  useShellCommandRegistration: (command: typeof shell.command) => { shell.command = command; },
}));
vi.mock("@/components/providers/context-panel-provider", () => ({
  useContextPanel: (panel: ReactNode) => { context.panel = panel; },
}));
vi.mock("../lib/graph-realtime", () => ({
  useGraphRealtime: () => realtime.status,
}));
vi.mock("../lib/graph-api", async () => {
  const actual = await vi.importActual<typeof GraphApiModule>("../lib/graph-api");
  return { ...actual, graphApi: { graph: vi.fn(), directory: vi.fn(), detail: vi.fn(), search: vi.fn(), createEdge: vi.fn(), deleteEdge: vi.fn() } };
});
vi.mock("./graph-surface", () => {
  return {
    GraphSurface: forwardRef(function MockGraphSurface(props: {
      nodes: readonly NodeData[];
      renderer: string;
      reducedMotion: boolean;
      selectedIds: ReadonlySet<string>;
      opacityById: ReadonlyMap<string, number>;
      onSelect: (id: string, additive: boolean) => void;
      onOpen: (id: string) => void;
      onContext: (request: { node: NodeData; clientX: number; clientY: number }) => void;
    }, ref) {
      useImperativeHandle(ref, () => ({ zoomIn: vi.fn(), zoomOut: vi.fn(), fit: vi.fn(), reset: vi.fn(), centerNode: vi.fn() }));
      return <div data-testid="graph-surface" data-renderer={props.renderer} data-reduced-motion={String(props.reducedMotion)}>{props.nodes.map((node) => <button id={`graph-node-${node.id}`} key={node.id} type="button" data-opacity={props.opacityById.get(node.id)} aria-pressed={props.selectedIds.has(node.id)} onClick={(event) => props.onSelect(node.id, event.shiftKey)} onDoubleClick={() => props.onOpen(node.id)} onKeyDown={(event) => { if (event.shiftKey && event.key === "F10") props.onContext({ node, clientX: 20, clientY: 20 }); }}>{node.label}</button>)}</div>;
    }),
  };
});
vi.mock("./graph-detail", () => ({
  GraphDetailDrawer: ({ node, open, onClose }: { node: NodeData | null; open: boolean; onClose: () => void }) => open ? <div role="dialog" aria-label="Graph details"><span>{node?.label}</span><button type="button" onClick={onClose}>Close details</button></div> : null,
}));

const clientId = "00000000-0000-4000-8000-000000000001";
const clientEntityId = "10000000-0000-4000-8000-000000000001";
const contactId = "00000000-0000-4000-8000-000000000002";
const contactEntityId = "10000000-0000-4000-8000-000000000002";
const client: NodeData = {
  id: clientId,
  stableKey: `client:${clientEntityId}`,
  entityId: clientEntityId,
  type: "client",
  label: "Atlas Automation",
  summary: "Automation client account",
  status: "active",
  action: "active_running",
  tags: ["automation", "priority"],
  hubKeys: ["clients"],
  position: null,
  metadata: { name: "Atlas Automation", industry: "Automation", mrr: 4000, status: "active", startDate: "2026-01-12", projectsCount: 3 },
};
const contact: NodeData = {
  id: contactId,
  stableKey: `contact:${contactEntityId}`,
  entityId: contactEntityId,
  type: "human_contact",
  label: "Ari Atlas",
  summary: "Primary contact at Atlas Automation",
  status: "active",
  action: "pending",
  tags: ["primary"],
  hubKeys: ["clients"],
  position: null,
  metadata: { name: "Ari Atlas", role: "Owner", company: "Atlas Automation", email: "ari@example.test", lastContact: "2026-08-01T12:00:00.000Z" },
};
const graphResponse: GraphResponse = {
  nodes: [client, contact],
  edges: [{ id: "edge:atlas-contact", type: "ownership", sourceNodeId: clientId, targetNodeId: contactId, label: "Primary contact", origin: "projection", projectionKey: "clients", createdAt: "2026-08-01T12:00:00.000Z" }],
  generatedAt: "2026-08-01T12:00:00.000Z",
  revision: "revision:test",
};
const directory: GraphDirectoryResponse = {
  total: 1,
  groups: [{ key: "clients", label: "Clients", count: 1, items: [{ nodeId: client.id, stableKey: client.stableKey, entityId: client.entityId, label: client.label, nodeType: "client", status: "active", statusLabel: "Active", secondaryLabel: "$4,000 MRR", hubKeys: ["clients"], sortValue: 4000 }] }],
};

let mobile = false;
let reducedMotion = false;

function installMatchMedia() {
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn((query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? reducedMotion : query.includes("767px") ? mobile : query.includes("1279px") ? mobile : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) });
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={queryClient}><LiveRegionProvider>{children}</LiveRegionProvider></QueryClientProvider>;
}

beforeEach(() => {
  mobile = false;
  reducedMotion = false;
  realtime.status = "unconfigured";
  installMatchMedia();
  navigation.search = "";
  navigation.replace.mockReset();
  navigation.push.mockReset();
  shell.command = null;
  context.panel = null;
  vi.mocked(graphApi.graph).mockReset().mockResolvedValue(graphResponse);
  vi.mocked(graphApi.directory).mockReset().mockResolvedValue(directory);
  vi.mocked(graphApi.search).mockReset().mockResolvedValue({ query: "atlas", total: 1, results: [{ node: client, score: 1, matchedFields: ["label"] }] });
  vi.mocked(graphApi.createEdge).mockReset().mockResolvedValue({ id: "edge:owner:new", sourceNodeId: client.id, targetNodeId: contact.id, type: "data_flow", label: null, origin: "owner", projectionKey: null, createdAt: "2026-08-01T12:00:00.000Z" });
  vi.mocked(graphApi.deleteEdge).mockReset();
});

describe("GraphWorkspace", () => {
  it.each([
    ["connected", "Live updates connected"],
    ["reconnecting", "Live updates reconnecting"],
    ["unavailable", "Live updates unavailable"],
    ["unconfigured", "Live updates unconfigured"],
  ] as const)("surfaces the %s Realtime state with text and an icon", async (status, label) => {
    realtime.status = status;
    render(<GraphWorkspace />, { wrapper });
    await screen.findAllByText("Atlas Automation");
    const indicator = screen.getByRole("status", { name: label });
    expect(indicator).toHaveTextContent(label);
    expect(indicator.querySelector("svg")).not.toBeNull();
  });

  it("persists every LENS filter in the URL, renders active tags, and clears only LENS state", async () => {
    const user = userEvent.setup();
    navigation.search = "entity=client&function=clients&action=active_running&view=compact";
    render(<GraphWorkspace />, { wrapper });
    await screen.findAllByText("Atlas Automation");

    expect(screen.getByRole("button", { name: "Remove Entity: Client" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Function: Clients" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Action: Active / Running" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Atlas Automation" })).toHaveAttribute("data-opacity", "1");
    expect(screen.getByRole("button", { name: "Ari Atlas" })).toHaveAttribute("data-opacity", "0.1");
    await user.selectOptions(screen.getByRole("combobox", { name: "Entity filter" }), "task");
    expect(navigation.replace).toHaveBeenCalledWith("/knowledge-graph?view=compact&entity=task&function=clients&action=active_running", { scroll: false });
    await user.click(screen.getByRole("button", { name: "Clear All" }));
    expect(navigation.replace).toHaveBeenLastCalledWith("/knowledge-graph?view=compact", { scroll: false });
  });

  it("registers route-owned fuzzy search and exposes directory plus live legend counts", async () => {
    const user = userEvent.setup();
    render(<GraphWorkspace />, { wrapper });
    await screen.findAllByText("Atlas Automation");

    expect(shell.command).toMatchObject({ buttonLabel: "Search knowledge graph", buttonText: "Search graph nodes" });
    act(() => shell.command?.invoke());
    expect(await screen.findByRole("dialog", { name: "Search knowledge graph" })).toBeInTheDocument();
    await user.type(screen.getByRole("searchbox", { name: "Search graph nodes" }), "atlas");
    expect(await screen.findByText("1 results")).toBeInTheDocument();

    expect(screen.getByTestId("graph-desktop-directory")).toHaveTextContent("Workspace entities");
    expect(screen.getByRole("button", { name: /Legend/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("2 nodes · 1 edges")).toBeInTheDocument();
    expect(screen.getAllByText("Human / Contact").length).toBeGreaterThan(0);
    expect(screen.getByText("Ownership")).toBeInTheDocument();
    expect(context.panel).not.toBeNull();
  });

  it("renders a semantic searchable and filterable mobile list instead of a canvas", async () => {
    mobile = true;
    installMatchMedia();
    const user = userEvent.setup();
    render(<GraphWorkspace />, { wrapper });
    const list = await screen.findByTestId("graph-mobile-list");

    expect(list).toHaveAttribute("aria-label", "Mobile knowledge graph list");
    expect(screen.queryByTestId("graph-visual-surface")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Atlas Automation, Client, status active, 1 connected entity/ })).toBeInTheDocument();
    await user.type(screen.getByRole("searchbox", { name: "Search graph list" }), "Ari");
    expect(screen.queryByText("Atlas Automation", { selector: "strong" })).not.toBeInTheDocument();
    expect(screen.getByText("Ari Atlas", { selector: "strong" })).toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Mobile node type filter" }), "client");
    expect(screen.getByText("No matching graph nodes")).toBeInTheDocument();
  });

  it("supports Shift multi-selection, batch state, keyboard context actions, and honest unavailable actions", async () => {
    const user = userEvent.setup();
    render(<GraphWorkspace />, { wrapper });
    const atlas = await screen.findByRole("button", { name: "Atlas Automation" });
    const ari = screen.getByRole("button", { name: "Ari Atlas" });

    await user.click(atlas);
    fireEvent.click(ari, { shiftKey: true });
    expect(screen.getByRole("region", { name: "Batch graph actions" })).toHaveTextContent("2 selected");
    fireEvent.keyDown(atlas, { key: "F10", shiftKey: true });
    const menu = await screen.findByRole("menu", { name: "Actions for Atlas Automation" });
    expect(menu).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Connect" })).toBeEnabled();
    expect(screen.getByRole("menuitem", { name: /Archive/ })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: /Delete/ })).toBeDisabled();
    await user.click(screen.getByRole("menuitem", { name: "Open" }));
    expect(screen.getByRole("dialog", { name: "Graph details" })).toHaveTextContent("Atlas Automation");
  });

  it("uses the graph package renderer policy at the 500-node Canvas threshold", async () => {
    const nodes = Array.from({ length: 500 }, (_, index): NodeData => ({
      ...client,
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      stableKey: `client:test-${index + 1}`,
      entityId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      label: `Client ${index + 1}`,
    }));
    vi.mocked(graphApi.graph).mockResolvedValue({ ...graphResponse, nodes, edges: [] });
    render(<GraphWorkspace />, { wrapper });
    await waitFor(() => expect(screen.getByTestId("graph-surface")).toHaveAttribute("data-renderer", "canvas"));
  });

  it("passes reduced-motion preference into the renderer", async () => {
    reducedMotion = true;
    installMatchMedia();
    render(<GraphWorkspace />, { wrapper });
    await waitFor(() => expect(screen.getByTestId("graph-surface")).toHaveAttribute("data-reduced-motion", "true"));
  });
});
