"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  Check,
  CircleOff,
  Edit3,
  Expand,
  Focus,
  FolderTree,
  Link2,
  Maximize2,
  Minus,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  WifiOff,
  X,
} from "lucide-react";
import type {
  GraphActionState,
  GraphEdgeCreateInput,
  GraphEdgeType,
  GraphNodeType,
  GraphResponse,
  HubKey,
  LensFilters,
  NodeData,
} from "@aios/contracts";
import {
  GRAPH_ACTION_STATE_LABELS,
  GRAPH_EDGE_TYPE_LABELS,
  GRAPH_NODE_TYPE_LABELS,
  HUB_LABELS,
  graphActionStates,
  graphEdgeTypes,
  graphNodeTypes,
  hubKeys,
} from "@aios/contracts";
import {
  applyLensFilters,
  clearAllLensFilters,
  parseLensFilters,
  validateRelationshipCreate,
  selectGraphRenderer,
  serializeLensFilters,
} from "@aios/graph";
import { useShellCommandRegistration } from "@/components/providers/command-registration-provider";
import { useContextPanel } from "@/components/providers/context-panel-provider";
import { Badge, Button, Dialog, Empty, Select, Skeleton, useAnnounce } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ApiClientError } from "@/lib/api-client";
import { GraphDetailDrawer } from "./graph-detail";
import { deriveDirectory, GraphDirectoryDrawer, GraphDirectoryPanel } from "./graph-directory";
import { GraphLegend } from "./graph-legend";
import { GraphSurface, type GraphSurfaceHandle } from "./graph-surface";
import { graphApi, graphQueryKeys } from "../lib/graph-api";
import { useGraphRealtime, type GraphRealtimeStatus } from "../lib/graph-realtime";

const MAX_VISIBLE_NODES = 500;

type Viewport = "desktop" | "tablet" | "mobile";
type ContextRequest = Readonly<{ node: NodeData; clientX: number; clientY: number }>;

function useViewport(): Viewport {
  const [viewport, setViewport] = useState<Viewport>("desktop");
  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 767px)");
    const tablet = window.matchMedia("(max-width: 1279px)");
    const update = () => setViewport(mobile.matches ? "mobile" : tablet.matches ? "tablet" : "desktop");
    update();
    mobile.addEventListener("change", update);
    tablet.addEventListener("change", update);
    return () => { mobile.removeEventListener("change", update); tablet.removeEventListener("change", update); };
  }, []);
  return viewport;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

function GraphLoadingState() {
  return <div className="absolute inset-0 grid place-items-center" role="status" aria-label="Loading knowledge graph"><div className="grid justify-items-center gap-4"><Skeleton className="size-16 rounded-full" /><p className="text-xs text-[#888]">Loading graph entities and relationships…</p></div></div>;
}

function GraphErrorState({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const requestId = error instanceof ApiClientError ? error.requestId : undefined;
  return <div className="absolute inset-0 grid place-items-center p-6"><Empty title="Graph unavailable" description={`${error.message}${requestId ? ` Request ID: ${requestId}.` : ""}`} action={<Button onClick={onRetry}>Retry graph</Button>} /></div>;
}

function LensToolbar({ filters, search, onChange, onClear }: { filters: LensFilters; search: string; onChange: (filters: LensFilters) => void; onClear: () => void }) {
  const active = filters.entity !== "all" || filters.function !== "all" || filters.action !== "all";
  const clearFilter = (key: keyof LensFilters) => onChange({ ...filters, [key]: "all" });
  return (
    <section aria-label="LENS filters" className="border-b border-[#2A2E45] bg-[#0C1020]/85 px-3 py-2 backdrop-blur-sm sm:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 font-mono text-[10px] font-semibold tracking-[0.18em] text-cyan-300">LENS</span>
        <Select aria-label="Entity filter" value={filters.entity} onChange={(event) => onChange({ ...filters, entity: event.target.value as LensFilters["entity"] })} className="h-8 w-[9.5rem] text-xs"><option value="all">All entities</option>{graphNodeTypes.map((type) => <option key={type} value={type}>{GRAPH_NODE_TYPE_LABELS[type]}</option>)}</Select>
        <Select aria-label="Function filter" value={filters.function} onChange={(event) => onChange({ ...filters, function: event.target.value as LensFilters["function"] })} className="h-8 w-[10rem] text-xs"><option value="all">All functions</option>{hubKeys.map((hub) => <option key={hub} value={hub}>{HUB_LABELS[hub]}</option>)}</Select>
        <Select aria-label="Action filter" value={filters.action} onChange={(event) => onChange({ ...filters, action: event.target.value as LensFilters["action"] })} className="h-8 w-[10rem] text-xs"><option value="all">All actions</option>{graphActionStates.map((action) => <option key={action} value={action}>{GRAPH_ACTION_STATE_LABELS[action]}</option>)}</Select>
        {active ? <Button size="sm" variant="ghost" onClick={onClear}>Clear All</Button> : null}
        <span className="ml-auto hidden font-mono text-[10px] text-[#888] sm:inline">{search ? `Shared URL · ${search}` : "All graph context"}</span>
      </div>
      {active ? <div aria-label="Active LENS filters" className="mt-2 flex flex-wrap gap-1.5">{filters.entity !== "all" ? <FilterTag label={`Entity: ${GRAPH_NODE_TYPE_LABELS[filters.entity as GraphNodeType]}`} onRemove={() => clearFilter("entity")} /> : null}{filters.function !== "all" ? <FilterTag label={`Function: ${HUB_LABELS[filters.function as HubKey]}`} onRemove={() => clearFilter("function")} /> : null}{filters.action !== "all" ? <FilterTag label={`Action: ${GRAPH_ACTION_STATE_LABELS[filters.action as GraphActionState]}`} onRemove={() => clearFilter("action")} /> : null}</div> : null}
    </section>
  );
}

function FilterTag({ label, onRemove }: { label: string; onRemove: () => void }) {
  return <span className="inline-flex items-center gap-1 rounded-full border border-cyan-300/25 bg-cyan-300/10 py-1 pl-2.5 pr-1 text-[10px] text-cyan-100">{label}<button type="button" aria-label={`Remove ${label}`} onClick={onRemove} className="grid size-5 place-items-center rounded-full hover:bg-white/10"><X aria-hidden="true" className="size-3" /></button></span>;
}

function MobileGraphList({ nodes, edges, opacityById, selectedIds, onSelect, onOpen, onContext }: {
  nodes: readonly NodeData[];
  edges: readonly { sourceNodeId: string; targetNodeId: string }[];
  opacityById: ReadonlyMap<string, number>;
  selectedIds: ReadonlySet<string>;
  onSelect: (nodeId: string, additive: boolean) => void;
  onOpen: (nodeId: string) => void;
  onContext: (request: ContextRequest) => void;
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<GraphNodeType | "all">("all");
  const filtered = nodes.filter((node) => {
    const haystack = [node.label, node.summary, node.status, GRAPH_NODE_TYPE_LABELS[node.type], ...node.tags].filter(Boolean).join(" ").toLocaleLowerCase();
    return (type === "all" || node.type === type) && (!query.trim() || haystack.includes(query.trim().toLocaleLowerCase()));
  });
  return (
    <section data-testid="graph-mobile-list" aria-label="Mobile knowledge graph list" className="surface-scrollbar min-h-0 flex-1 overflow-y-auto p-3 md:hidden">
      <div className="sticky top-0 z-10 mb-3 grid gap-2 border-b border-[#2A2E45] bg-[#07080F]/95 pb-3 backdrop-blur"><label className="relative"><span className="sr-only">Search graph list</span><Search aria-hidden="true" className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#888]" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search nodes, tags, status…" className="h-10 w-full rounded-lg border border-[#2A2E45] bg-[#0C1020] pl-9 pr-3 text-sm text-[#F3F5FF]" /></label><Select aria-label="Mobile node type filter" value={type} onChange={(event) => setType(event.target.value as GraphNodeType | "all")}><option value="all">All node types</option>{graphNodeTypes.map((nodeType) => <option key={nodeType} value={nodeType}>{GRAPH_NODE_TYPE_LABELS[nodeType]}</option>)}</Select></div>
      <p className="mb-2 font-mono text-[10px] text-[#888]">{filtered.length} of {nodes.length} nodes · semantic list view</p>
      {filtered.length ? <ul className="grid gap-2">{filtered.map((node) => { const connections = edges.filter((edge) => edge.sourceNodeId === node.id || edge.targetNodeId === node.id).length; return <li key={node.id} style={{ opacity: opacityById.get(node.id) ?? 1 }}><button id={`graph-node-${node.id}`} type="button" aria-pressed={selectedIds.has(node.id)} aria-label={`${node.label}, ${GRAPH_NODE_TYPE_LABELS[node.type]}${node.status ? `, status ${node.status.replaceAll("_", " ")}` : ""}, ${connections} connected ${connections === 1 ? "entity" : "entities"}`} onClick={(event) => onSelect(node.id, event.shiftKey)} onDoubleClick={() => onOpen(node.id)} onContextMenu={(event) => { event.preventDefault(); onContext({ node, clientX: event.clientX, clientY: event.clientY }); }} onKeyDown={(event) => { if (event.key === "Enter") onOpen(node.id); if (event.shiftKey && event.key === "F10") { event.preventDefault(); const bounds = event.currentTarget.getBoundingClientRect(); onContext({ node, clientX: bounds.left + 16, clientY: bounds.top + 16 }); } }} className={cn("w-full rounded-xl border bg-[#0C1020] p-3 text-left", selectedIds.has(node.id) ? "border-cyan-300/50" : "border-[#2A2E45]")}><span className="flex items-start justify-between gap-3"><span className="min-w-0"><strong className="block truncate text-sm text-[#F3F5FF]">{node.label}</strong><span className="mt-1 block text-[10px] uppercase tracking-[0.1em] text-cyan-300">{GRAPH_NODE_TYPE_LABELS[node.type]}</span></span>{node.status ? <Badge>{node.status.replaceAll("_", " ")}</Badge> : null}</span>{node.summary ? <span className="mt-2 block text-xs leading-5 text-[#888]">{node.summary}</span> : null}<span className="mt-2 block font-mono text-[10px] text-[#888]">{connections} connected {connections === 1 ? "entity" : "entities"}{node.tags.length ? ` · ${node.tags.join(", ")}` : ""}</span></button></li>; })}</ul> : <Empty title="No matching graph nodes" description="Adjust the mobile search or node type filter." />}
    </section>
  );
}

function SearchDialog({ open, onClose, nodes, onChoose }: { open: boolean; onClose: () => void; nodes: readonly NodeData[]; onChoose: (nodeId: string) => void }) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim());
  const inputRef = useRef<HTMLInputElement>(null);
  const search = useQuery({ queryKey: graphQueryKeys.search({ query: deferredQuery || "_", limit: 20 }), queryFn: () => graphApi.search({ query: deferredQuery, limit: 20 }), enabled: open && deferredQuery.length > 0, retry: false });
  useEffect(() => { if (!open) setQuery(""); }, [open]);
  const local = useMemo(() => {
    if (!deferredQuery) return nodes.slice(0, 12);
    const terms = deferredQuery.toLocaleLowerCase().split(/\s+/);
    return nodes.map((node) => ({ node, score: terms.reduce((score, term) => { const label = node.label.toLocaleLowerCase(); const haystack = [node.label, node.summary, node.type, ...node.tags].filter(Boolean).join(" ").toLocaleLowerCase(); return score + (label === term ? 4 : label.startsWith(term) ? 3 : haystack.includes(term) ? 1 : 0); }, 0) })).filter((result) => result.score > 0).sort((a, b) => b.score - a.score).slice(0, 20).map((result) => result.node);
  }, [deferredQuery, nodes]);
  const results = search.data?.results.map((result) => result.node) ?? local;
  return <Dialog open={open} onClose={onClose} title="Search knowledge graph" description="Fuzzy search authoritative node labels, types, tags, and summaries." initialFocusRef={inputRef}><label className="relative block"><span className="sr-only">Search graph nodes</span><Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#888]" /><input ref={inputRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search clients, contacts, hubs, tasks…" className="h-11 w-full rounded-lg border border-[#2A2E45] bg-[#07080F] pl-10 pr-3 text-sm text-[#F3F5FF]" /></label><div className="mt-3"><p className="mb-2 font-mono text-[10px] text-[#888]">{search.isFetching ? "Searching graph…" : `${results.length} results`}</p>{results.length ? <ul className="grid max-h-[min(55vh,28rem)] gap-1 overflow-y-auto">{results.map((node) => <li key={node.id}><button type="button" className="flex min-h-12 w-full items-center gap-3 rounded-lg border border-transparent px-3 text-left hover:border-cyan-300/20 hover:bg-cyan-300/5" onClick={() => { onChoose(node.id); onClose(); }}><span className="min-w-0 flex-1"><strong className="block truncate text-xs text-[#F3F5FF]">{node.label}</strong><span className="text-[10px] text-[#888]">{GRAPH_NODE_TYPE_LABELS[node.type]}{node.status ? ` · ${node.status.replaceAll("_", " ")}` : ""}</span></span><span className="text-[10px] text-cyan-300">Center</span></button></li>)}</ul> : <Empty className="min-h-40" title="No graph matches" description="Try a broader label, type, tag, or summary." />}</div></Dialog>;
}

function validTargets(source: NodeData, type: GraphEdgeType, nodes: readonly NodeData[], edges: GraphResponse["edges"]) {
  return nodes.filter((target) => validateRelationshipCreate({ sourceNodeId: source.id, targetNodeId: target.id, type, label: null }, { nodes, edges }).valid);
}

function hasValidTarget(source: NodeData, nodes: readonly NodeData[], edges: GraphResponse["edges"]) {
  return graphEdgeTypes.some((type) => validTargets(source, type, nodes, edges).length > 0);
}

function graphMutationKey(prefix: string) {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${id.replaceAll("-", "")}`;
}

function ConnectDialog({ source, nodes, edges, onClose }: { source: NodeData | null; nodes: readonly NodeData[]; edges: GraphResponse["edges"]; onClose: () => void }) {
  const cache = useQueryClient();
  const announce = useAnnounce();
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [edgeType, setEdgeType] = useState<GraphEdgeType>("data_flow");
  const [targetId, setTargetId] = useState("");
  const [label, setLabel] = useState("");
  const options = useMemo(() => source ? graphEdgeTypes.map((type) => ({ type, targets: validTargets(source, type, nodes, edges) })).filter((option) => option.targets.length > 0) : [], [edges, nodes, source]);
  const selectedOption = options.find((option) => option.type === edgeType) ?? options[0];
  const targets = selectedOption?.targets ?? [];
  const filteredTargets = targets.filter((target) => !search.trim() || [target.label, GRAPH_NODE_TYPE_LABELS[target.type], target.status, ...target.tags].filter(Boolean).join(" ").toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const selectedTarget = filteredTargets.find((target) => target.id === targetId) ?? filteredTargets[0];
  const labelError = label.trim().length > 255 ? "Relationship labels must be 255 characters or fewer." : null;
  const candidate: GraphEdgeCreateInput | null = source && selectedOption && selectedTarget ? { sourceNodeId: source.id, targetNodeId: selectedTarget.id, type: selectedOption.type, label: label.trim() || null } : null;
  const validation = candidate ? validateRelationshipCreate(candidate, { nodes, edges }) : null;
  const create = useMutation({
    mutationFn: ({ input, idempotencyKey }: { input: GraphEdgeCreateInput; idempotencyKey: string }) => graphApi.createEdge(input, idempotencyKey),
    onMutate: () => announce("Creating graph connection."),
    onSuccess: async () => {
      const sourceId = source?.id;
      announce("Graph connection created.");
      await cache.invalidateQueries({ queryKey: graphQueryKeys.root });
      onClose();
      if (sourceId) requestAnimationFrame(() => document.getElementById(`graph-node-${sourceId}`)?.focus());
    },
    onError: (error) => announce(`Graph connection could not be created. ${error instanceof Error ? error.message : "Try again."}`),
  });

  useEffect(() => {
    if (!source) return;
    const first = options[0];
    setSearch("");
    setLabel("");
    setEdgeType(first?.type ?? "data_flow");
    setTargetId(first?.targets[0]?.id ?? "");
    create.reset();
  }, [source?.id]);

  const close = () => {
    if (create.isPending) return;
    const sourceId = source?.id;
    onClose();
    if (sourceId) requestAnimationFrame(() => document.getElementById(`graph-node-${sourceId}`)?.focus());
  };
  return (
    <Dialog open={Boolean(source)} onClose={close} title="Connect graph entities" description="Create an owner-managed relationship. The source is fixed from the node context menu." initialFocusRef={searchRef}>
      <form className="grid gap-4" onSubmit={(event) => {
        event.preventDefault();
        if (!candidate || labelError || !validation?.valid) return;
        create.mutate({ input: candidate, idempotencyKey: graphMutationKey("graph_edge_create") });
      }}>
        <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]">Source<input value={source?.label ?? ""} readOnly className="h-10 rounded-lg border border-[#2A2E45] bg-white/[0.03] px-3 text-sm text-[#888]" /></label>
        <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]">Relationship type<Select aria-label="Relationship type" value={selectedOption?.type ?? ""} onChange={(event) => { const next = event.target.value as GraphEdgeType; setEdgeType(next); setTargetId(options.find((option) => option.type === next)?.targets[0]?.id ?? ""); }}>{options.map((option) => <option key={option.type} value={option.type}>{GRAPH_EDGE_TYPE_LABELS[option.type]}</option>)}</Select></label>
        <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]">Search targets<input ref={searchRef} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search label, type, status, or tag…" className="h-10 rounded-lg border border-[#2A2E45] bg-[#07080F] px-3 text-sm text-[#F3F5FF]" /></label>
        <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]">Target<Select aria-label="Target" value={selectedTarget?.id ?? ""} onChange={(event) => setTargetId(event.target.value)} disabled={!filteredTargets.length}><option value="">{filteredTargets.length ? "Choose a target" : "No valid matching targets"}</option>{filteredTargets.map((target) => <option key={target.id} value={target.id}>{target.label} · {GRAPH_NODE_TYPE_LABELS[target.type]}</option>)}</Select></label>
        <label className="grid gap-1.5 text-xs font-medium text-[#C5C8DB]">Label <span className="font-normal text-[#666]">(optional)</span><input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={256} aria-invalid={Boolean(labelError)} aria-describedby={labelError ? "graph-edge-label-error" : undefined} className="h-10 rounded-lg border border-[#2A2E45] bg-[#07080F] px-3 text-sm text-[#F3F5FF]" /></label>
        {labelError ? <p id="graph-edge-label-error" role="alert" className="text-xs text-red-200">{labelError}</p> : null}
        {validation && !validation.valid ? <p role="alert" className="rounded-lg border border-red-400/30 bg-red-400/[0.06] p-3 text-xs text-red-200">{validation.message}</p> : null}
        {create.isError ? <p role="alert" className="rounded-lg border border-red-400/30 bg-red-400/[0.06] p-3 text-xs text-red-200">Connection creation failed. {create.error instanceof Error ? create.error.message : "Try again."}</p> : null}
        <div className="flex justify-end gap-2 border-t border-[#2A2E45] pt-4"><Button type="button" variant="ghost" onClick={close} disabled={create.isPending}>Cancel</Button><Button type="submit" disabled={create.isPending || Boolean(labelError) || !validation?.valid}>{create.isPending ? "Connecting…" : "Create connection"}</Button></div>
      </form>
    </Dialog>
  );
}

function GraphContextMenu({ request, canConnect, onClose, onOpen, onEdit, onConnect }: { request: ContextRequest | null; canConnect: boolean; onClose: () => void; onOpen: (node: NodeData) => void; onEdit: (node: NodeData) => void; onConnect: (node: NodeData) => void }) {
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!request) return;
    const close = (event: MouseEvent) => { if (!menuRef.current?.contains(event.target as Node)) onClose(); };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
      event.preventDefault();
      const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
      if (!items.length) return;
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", keyboard);
    requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus());
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", keyboard); };
  }, [onClose, request]);
  if (!request) return null;
  const canEdit = request.node.type === "client" && Boolean(request.node.entityId);
  const x = Math.min(request.clientX, window.innerWidth - 220);
  const y = Math.min(request.clientY, window.innerHeight - 260);
  return <div ref={menuRef} role="menu" aria-label={`Actions for ${request.node.label}`} className="fixed z-[130] w-52 rounded-xl border border-[#2A2E45] bg-[#111533] p-1.5 shadow-2xl" style={{ left: Math.max(8, x), top: Math.max(8, y) }}><MenuAction icon={Expand} label="Open" onClick={() => onOpen(request.node)} /><MenuAction icon={Edit3} label="Edit" disabled={!canEdit} title={canEdit ? "Edit the source client" : "No owning-domain editor is available for this node type"} onClick={() => onEdit(request.node)} /><MenuAction icon={Link2} label="Connect" disabled={!canConnect} title={canConnect ? "Create an owner-managed graph relationship" : "No valid target is available for this source"} onClick={() => onConnect(request.node)} /><div className="my-1 h-px bg-[#2A2E45]" /><MenuAction icon={Archive} label="Archive" disabled title="Archive through the owning domain" /><MenuAction icon={Trash2} label="Delete" disabled danger title="Delete through the owning domain with impact review" /></div>;
}

function MenuAction({ icon: Icon, label, disabled, danger, title, onClick }: { icon: typeof Search; label: string; disabled?: boolean; danger?: boolean; title?: string; onClick?: () => void }) {
  return <button type="button" role="menuitem" disabled={disabled} title={title} onClick={onClick} className={cn("flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 text-xs", danger ? "text-red-200 hover:bg-red-400/10" : "text-[#C5C8DB] hover:bg-white/5", disabled && "text-[#555]")}><Icon aria-hidden="true" className="size-3.5" />{label}{disabled ? <span className="ml-auto text-[9px]">Unavailable</span> : null}</button>;
}

function BatchBar({ selectedIds, onClear }: { selectedIds: ReadonlySet<string>; onClear: () => void }) {
  if (selectedIds.size < 2) return null;
  return <div role="region" aria-label="Batch graph actions" className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-cyan-300/30 bg-[#111533]/95 p-1.5 shadow-xl"><span className="px-2 text-xs text-cyan-100"><Check aria-hidden="true" className="mr-1 inline size-3" />{selectedIds.size} selected</span><Button size="sm" variant="ghost" disabled title="Batch relationships are not available yet">Connect</Button><Button size="sm" variant="ghost" disabled title="Archive through each owning domain">Archive</Button><Button size="sm" variant="ghost" onClick={onClear}>Clear selection</Button></div>;
}

const REALTIME_STATUS_PRESENTATION = {
  connected: { label: "Live updates connected", icon: Radio },
  reconnecting: { label: "Live updates reconnecting", icon: RefreshCw },
  unavailable: { label: "Live updates unavailable", icon: WifiOff },
  unconfigured: { label: "Live updates unconfigured", icon: CircleOff },
} satisfies Record<GraphRealtimeStatus, { label: string; icon: typeof Radio }>;

function GraphRealtimeIndicator({ status }: { status: GraphRealtimeStatus }) {
  const presentation = REALTIME_STATUS_PRESENTATION[status];
  const Icon = presentation.icon;
  return <p role="status" aria-label={presentation.label} title={presentation.label} className="m-0 inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#2A2E45] px-2 py-1 font-mono text-[10px] text-[#C5C8DB]"><Icon aria-hidden="true" className="size-3.5" /><span className="hidden sm:inline">{presentation.label}</span></p>;
}

export function GraphWorkspace() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const announce = useAnnounce();
  const realtimeStatus = useGraphRealtime(announce);
  const surfaceRef = useRef<GraphSurfaceHandle>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const viewport = useViewport();
  const reducedMotion = useReducedMotion();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [contextRequest, setContextRequest] = useState<ContextRequest | null>(null);
  const [connectSource, setConnectSource] = useState<NodeData | null>(null);
  const graph = useQuery({ queryKey: graphQueryKeys.complete(), queryFn: graphApi.graph });
  const directoryQuery = useQuery({ queryKey: graphQueryKeys.directory(), queryFn: () => graphApi.directory(), retry: false });
  const filters = useMemo(() => parseLensFilters(searchParams.toString()), [searchParams]);
  const nodes = graph.data?.nodes ?? [];
  const edges = graph.data?.edges ?? [];
  const visibleNodes = nodes.slice(0, MAX_VISIBLE_NODES);
  const visibleIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
  const visibleEdges = useMemo(() => edges.filter((edge) => visibleIds.has(edge.sourceNodeId) && visibleIds.has(edge.targetNodeId)), [edges, visibleIds]);
  const filteredNodes = useMemo(() => applyLensFilters(visibleNodes, filters), [filters, visibleNodes]);
  const opacityById = useMemo(() => new Map(filteredNodes.map((entry) => [entry.node.id, entry.opacity])), [filteredNodes]);
  const directory = directoryQuery.data ?? deriveDirectory(nodes);
  const detailNode = nodes.find((node) => node.id === detailId) ?? null;
  const rendererDecision = selectGraphRenderer({ nodeCount: nodes.length, viewport });
  const renderer = rendererDecision.renderer === "list" ? "svg" : rendererDecision.renderer;

  const replaceFilters = (next: LensFilters) => {
    const search = serializeLensFilters(next, searchParams.toString());
    router.replace(`${pathname}${search ? `?${search}` : ""}`, { scroll: false });
  };
  const clearFilters = () => {
    const { search } = clearAllLensFilters(searchParams.toString());
    router.replace(`${pathname}${search ? `?${search}` : ""}`, { scroll: false });
  };
  const selectNode = (nodeId: string, additive: boolean) => {
    const next = additive ? new Set(selectedIds) : new Set<string>();
    if (additive && next.has(nodeId)) next.delete(nodeId); else next.add(nodeId);
    setSelectedIds(next);
    announce(`${next.size} graph ${next.size === 1 ? "node" : "nodes"} selected.`);
  };
  const openNode = (nodeId: string) => { setSelectedIds(new Set([nodeId])); setDetailId(nodeId); announce("Graph detail opened."); };
  const centerNode = (nodeId: string) => { selectNode(nodeId, false); requestAnimationFrame(() => surfaceRef.current?.centerNode(nodeId)); announce("Graph centered on selected node."); };

  useShellCommandRegistration({ buttonLabel: "Search knowledge graph", buttonText: "Search graph nodes", invoke: () => setSearchOpen(true) });
  const contextDirectory = <GraphDirectoryPanel directory={directory} selectedIds={selectedIds} onSelect={selectNode} onCenter={centerNode} />;
  useContextPanel(contextDirectory);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !searchOpen && !directoryOpen && !detailId && !contextRequest && !connectSource) {
        setSelectedIds(new Set());
        surfaceRef.current?.fit();
        announce("Graph view fitted and selection cleared.");
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [announce, connectSource, contextRequest, detailId, directoryOpen, searchOpen]);

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen(); else await workspaceRef.current?.requestFullscreen();
  };

  return (
    <section ref={workspaceRef} aria-labelledby="graph-workspace-title" className="graph-workspace flex min-h-0 w-full flex-1 flex-col bg-[#07080F]">
      <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-[#2A2E45] bg-[#07080F] px-3 sm:px-4">
        <div className="min-w-0"><p className="mb-0 text-[10px] uppercase tracking-[0.16em] text-cyan-300">Knowledge Graph</p><h1 id="graph-workspace-title" className="mb-0 truncate text-sm font-semibold text-[#F3F5FF]">Business command map</h1></div>
        <GraphRealtimeIndicator status={realtimeStatus} />
        <div className="flex items-center gap-1" role="toolbar" aria-label="Graph view controls">
          <span className="hidden sm:contents">
            <Button size="icon" variant="ghost" aria-label="Zoom out" onClick={() => surfaceRef.current?.zoomOut()}><Minus aria-hidden="true" className="size-4" /></Button>
            <Button size="icon" variant="ghost" aria-label="Zoom in" onClick={() => surfaceRef.current?.zoomIn()}><Plus aria-hidden="true" className="size-4" /></Button>
            <Button size="icon" variant="ghost" aria-label="Fit graph to view" onClick={() => surfaceRef.current?.fit()}><Focus aria-hidden="true" className="size-4" /></Button>
            <Button size="icon" variant="ghost" aria-label="Reset graph view" onClick={() => surfaceRef.current?.reset()}><RotateCcw aria-hidden="true" className="size-4" /></Button>
          </span>
          <Button size="icon" variant="ghost" aria-label="Toggle fullscreen graph" onClick={() => void toggleFullscreen()}><Maximize2 aria-hidden="true" className="size-4" /></Button>
          <Button size="icon" variant="ghost" aria-label="Open graph directory" onClick={() => setDirectoryOpen(true)} className="xl:hidden"><FolderTree aria-hidden="true" className="size-4" /></Button>
        </div>
      </header>
      <LensToolbar filters={filters} search={searchParams.toString()} onChange={replaceFilters} onClear={clearFilters} />
      <div className="flex min-h-0 flex-1">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {graph.isPending ? <GraphLoadingState /> : null}
          {graph.isError ? <GraphErrorState error={graph.error} onRetry={() => void graph.refetch()} /> : null}
          {graph.data && nodes.length === 0 ? <div className="absolute inset-0 grid place-items-center p-6"><Empty title="No graph entities yet" description="Hubs and source projections will appear when the graph API returns authoritative data." /></div> : null}
          {graph.data && nodes.length > 0 ? viewport === "mobile" ? (
            <MobileGraphList nodes={visibleNodes} edges={visibleEdges} opacityById={opacityById} selectedIds={selectedIds} onSelect={selectNode} onOpen={openNode} onContext={setContextRequest} />
          ) : (
            <div data-testid="graph-visual-surface" className="relative min-h-0 flex-1"><GraphSurface ref={surfaceRef} nodes={visibleNodes} edges={visibleEdges} renderer={renderer} opacityById={opacityById} selectedIds={selectedIds} onSelect={selectNode} onOpen={openNode} onContext={setContextRequest} onDropNode={(nodeId) => selectNode(nodeId, false)} reducedMotion={reducedMotion} /><BatchBar selectedIds={selectedIds} onClear={() => setSelectedIds(new Set())} /><GraphLegend nodes={nodes} edges={edges} reducedMotion={reducedMotion} />{rendererDecision.paginationRecommended ? <p role="status" className="absolute bottom-3 right-3 z-20 max-w-xs rounded-lg border border-orange-300/30 bg-[#111533]/95 px-3 py-2 text-[10px] text-orange-100">Showing the first {MAX_VISIBLE_NODES} of {nodes.length} nodes. Use LENS and search to narrow large graph views.</p> : null}</div>
          ) : null}
        </div>
        <div role="region" aria-label="Graph directory sidebar" data-testid="graph-desktop-directory" className="hidden w-72 shrink-0 border-l border-[#2A2E45] bg-[#0C1020]/75 xl:block">{contextDirectory}</div>
      </div>
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} nodes={nodes} onChoose={centerNode} />
      <GraphDirectoryDrawer open={directoryOpen} onClose={() => setDirectoryOpen(false)} directory={directory} selectedIds={selectedIds} onSelect={selectNode} onCenter={(nodeId) => { centerNode(nodeId); setDirectoryOpen(false); }} />
      <GraphDetailDrawer node={detailNode} open={Boolean(detailNode)} onClose={() => setDetailId(null)} onNavigateNode={(nodeId) => openNode(nodeId)} />
      <GraphContextMenu request={contextRequest} canConnect={Boolean(contextRequest && hasValidTarget(contextRequest.node, nodes, edges))} onClose={() => setContextRequest(null)} onOpen={(node) => { openNode(node.id); setContextRequest(null); }} onEdit={(node) => { if (node.type === "client" && node.entityId) router.push(`/clients/${node.entityId}`); setContextRequest(null); }} onConnect={(node) => { setContextRequest(null); setConnectSource(node); }} />
      <ConnectDialog source={connectSource} nodes={nodes} edges={edges} onClose={() => setConnectSource(null)} />
    </section>
  );
}
