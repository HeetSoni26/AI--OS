"use client";

import { useMemo, useState } from "react";
import { ChevronDown, GripVertical, Search } from "lucide-react";
import type { DirectoryGroupKey, GraphDirectoryResponse, NodeData } from "@aios/contracts";
import { GRAPH_NODE_TYPE_LABELS } from "@aios/contracts";
import { Badge, Drawer, Empty, Input } from "@/components/ui";
import { cn } from "@/lib/utils";

const directoryGroups: ReadonlyArray<{ key: DirectoryGroupKey; label: string }> = [
  { key: "ai_agents", label: "AI Agents" },
  { key: "clients", label: "Clients" },
  { key: "tools", label: "Tools" },
  { key: "recent_tasks", label: "Recent Tasks" },
  { key: "knowledge", label: "Knowledge" },
];

function fallbackGroup(node: NodeData): DirectoryGroupKey | null {
  if (node.type === "ai_agent") return "ai_agents";
  if (node.type === "client") return "clients";
  if (node.type === "tool") return "tools";
  if (node.type === "task") return "recent_tasks";
  if (["sop", "decision", "knowledge_memory"].includes(node.type)) return "knowledge";
  return null;
}

export function deriveDirectory(nodes: readonly NodeData[]): GraphDirectoryResponse {
  const groups = directoryGroups.map(({ key, label }) => {
    const items = nodes.filter((node) => fallbackGroup(node) === key).map((node) => ({
      nodeId: node.id,
      stableKey: node.stableKey,
      entityId: node.entityId,
      label: node.label,
      nodeType: node.type,
      status: node.status,
      statusLabel: node.status?.replaceAll("_", " ") ?? null,
      secondaryLabel: node.summary,
      hubKeys: node.hubKeys,
      sortValue: null,
    }));
    return { key, label, count: items.length, items };
  });
  return { groups, total: groups.reduce((total, group) => total + group.count, 0) };
}

export function GraphDirectoryPanel({ directory, selectedIds, onSelect, onCenter, compact = false }: {
  directory: GraphDirectoryResponse;
  selectedIds: ReadonlySet<string>;
  onSelect: (nodeId: string, additive: boolean) => void;
  onCenter: (nodeId: string) => void;
  compact?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<DirectoryGroupKey>>(new Set());
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = useMemo(() => directory.groups.map((group) => ({
    ...group,
    items: group.items.filter((item) => !normalizedQuery || [item.label, item.statusLabel, item.secondaryLabel, GRAPH_NODE_TYPE_LABELS[item.nodeType]].some((value) => value?.toLocaleLowerCase().includes(normalizedQuery))),
  })), [directory.groups, normalizedQuery]);
  const visibleCount = filtered.reduce((total, group) => total + group.items.length, 0);
  const toggleGroup = (key: DirectoryGroupKey) => setCollapsed((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  return (
    <section aria-label="Graph directory" className={cn("flex min-h-0 flex-col", !compact && "h-full")}>
      <div className="border-b border-[#2A2E45] p-4">
        <div className="mb-3 flex items-center justify-between"><div><p className="mb-1 text-[10px] uppercase tracking-[0.16em] text-cyan-300">Directory</p><h2 className="mb-0 text-sm font-semibold text-[#F3F5FF]">Workspace entities</h2></div><Badge>{directory.total} live</Badge></div>
        <div className="relative"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 z-10 size-3.5 -translate-y-1/2 text-[#888]" /><Input aria-label="Search graph directory" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search directory…" className="h-9 pl-9 text-xs" /></div>
      </div>
      <div className="surface-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
        {filtered.map((group) => {
          const isCollapsed = collapsed.has(group.key);
          return (
            <section key={group.key} aria-labelledby={`directory-${group.key}`} className="mb-1">
              <button type="button" className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-white/[0.04]" aria-expanded={!isCollapsed} onClick={() => toggleGroup(group.key)}><ChevronDown aria-hidden="true" className={cn("size-3 text-[#888] transition-transform", isCollapsed && "-rotate-90")} /><span id={`directory-${group.key}`} className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#888]">{group.label}</span><span className="ml-auto font-mono text-[10px] text-[#999]">{group.count}</span></button>
              {!isCollapsed ? <ul className="grid gap-1 pb-2">{group.items.map((item) => {
                const selected = selectedIds.has(item.nodeId);
                return <li key={item.nodeId}><button type="button" draggable onDragStart={(event) => event.dataTransfer.setData("application/x-aios-graph-node", item.nodeId)} onClick={(event) => onSelect(item.nodeId, event.shiftKey)} onDoubleClick={() => onCenter(item.nodeId)} aria-pressed={selected} className={cn("group flex min-h-12 w-full items-center gap-2 rounded-lg border px-2 text-left", selected ? "border-cyan-300/30 bg-cyan-300/10" : "border-transparent hover:border-[#2A2E45] hover:bg-white/[0.03]")}><GripVertical aria-hidden="true" className="size-3 shrink-0 text-[#555]" /><span className="min-w-0 flex-1"><span className="block truncate text-xs text-[#F3F5FF]">{item.label}</span><span className="mt-0.5 block truncate text-[10px] text-[#888]">{item.statusLabel ?? GRAPH_NODE_TYPE_LABELS[item.nodeType]}{item.secondaryLabel ? ` · ${item.secondaryLabel}` : ""}</span></span></button></li>;
              })}</ul> : null}
            </section>
          );
        })}
        {visibleCount === 0 ? <Empty className="m-2 min-h-40" title="No matching entities" description="Try a different directory search." /> : null}
      </div>
      <p className="mb-0 border-t border-[#2A2E45] px-4 py-3 text-[10px] leading-4 text-[#888]">Double-click to center. Drag an item onto the graph to position it.</p>
    </section>
  );
}

export function GraphDirectoryDrawer({ open, onClose, ...panelProps }: React.ComponentProps<typeof GraphDirectoryPanel> & { open: boolean; onClose: () => void }) {
  return <Drawer open={open} onClose={onClose} title="Graph directory" description="Search, select, and center graph entities." className="md:max-w-sm"><GraphDirectoryPanel {...panelProps} compact /></Drawer>;
}
