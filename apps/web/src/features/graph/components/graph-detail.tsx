"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import type { EdgeData, GraphNodeDetail, NodeData } from "@aios/contracts";
import { GRAPH_NODE_TYPE_LABELS } from "@aios/contracts";
import { canDeleteRelationship, getEdgeTypeDefinition, hubRegistry } from "@aios/graph";
import { Badge, Button, Dialog, Drawer, Empty, useAnnounce } from "@/components/ui";
import { ClientDetail } from "@/features/clients/components/client-detail";
import { ContactDetail } from "@/features/clients/components/contact-detail";
import { graphApi, graphQueryKeys } from "../lib/graph-api";

type ClientContactAdapter = (detail: GraphNodeDetail) => React.ReactNode;

export type GraphDomainDetailAdapters = Readonly<{
  clientContact?: ClientContactAdapter;
}>;

const fieldNames: Record<string, string> = {
  dueDate: "Due date",
  status: "Status",
  assignedAgentId: "Assigned agent",
  assignedPersonId: "Assigned person",
  lastUpdated: "Last updated",
  stepsCount: "Steps",
  category: "Category",
  lastAccessed: "Last accessed",
  wordCount: "Word count",
  date: "Date",
  rationale: "Rationale",
  outcome: "Outcome",
  amount: "Amount",
  type: "Entry type",
};

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not available";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "None";
  if (typeof value === "number") return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
  return String(value).replaceAll("_", " ");
}

function mutationKey(prefix: string) {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${id.replaceAll("-", "")}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Try again.";
}

function Facts({ node, keys }: { node: NodeData; keys: readonly string[] }) {
  const metadata: Record<string, unknown> = node.metadata;
  return (
    <dl className="grid gap-3">
      {keys.map((key) => (
        <div key={key} className="rounded-lg border border-[#2A2E45] bg-white/[0.02] px-3 py-2.5">
          <dt className="text-[10px] uppercase tracking-[0.12em] text-[#888]">{fieldNames[key] ?? key}</dt>
          <dd className="mb-0 mt-1 break-words text-xs text-[#F3F5FF]">{displayValue(metadata[key])}</dd>
        </div>
      ))}
    </dl>
  );
}

function HubDetail({ node }: { node: Extract<NodeData, { type: "hub" }> }) {
  const hub = hubRegistry[node.metadata.hubKey];
  return (
    <div className="grid gap-5">
      <div><p className="text-xs leading-5 text-[#C5C8DB]">{hub.summary}</p><p className="mb-0 font-mono text-xs text-cyan-200">{node.metadata.entityCount} connected entities · {node.metadata.summaryStat}</p></div>
      <section aria-labelledby="hub-contents"><h3 id="hub-contents" className="mb-2 text-xs font-semibold text-[#F3F5FF]">Hub contents</h3><ul className="grid gap-2 text-xs text-[#C5C8DB]">{hub.contents.map((content) => <li key={content} className="rounded-lg border border-[#2A2E45] px-3 py-2">{content}</li>)}</ul></section>
    </div>
  );
}

function TaskDetail({ node }: { node: Extract<NodeData, { type: "task" }> }) {
  return <Facts node={node} keys={["status", "dueDate", "assignedAgentId", "assignedPersonId"]} />;
}

function CurrentDomainDetail({ detail, adapter, onNavigateNode }: { detail: GraphNodeDetail; adapter?: ClientContactAdapter; onNavigateNode?: (nodeId: string) => void }) {
  if (adapter) return adapter(detail);
  const node = detail.node;
  if (node.type === "client") {
    if (!node.entityId) return <Empty className="min-h-44" title="Client source unavailable" description="This graph projection is not linked to an authorized client record." />;
    return <ClientDetail clientId={node.entityId} lazyMountTabs />;
  }
  if (node.type === "human_contact") {
    const sourceClient = detail.connections.map((connection) => connection.node).find((related) => related.type === "client" && related.entityId);
    if (!node.entityId) return <Empty className="min-h-44" title="Contact source unavailable" description="This graph projection is not linked to an authorized contact record." />;
    if (!sourceClient?.entityId) return <Empty className="min-h-44" title="Source client unavailable" description="The connected client required to authorize this contact request was not returned by graph detail." />;
    return <ContactDetail clientId={sourceClient.entityId} contactId={node.entityId} sourceClientName={sourceClient.label} onOpenClient={onNavigateNode ? () => onNavigateNode(sourceClient.id) : undefined} />;
  }
  return null;
}

function FutureDomainDetail({ node }: { node: NodeData }) {
  const keys = Object.keys(node.metadata).filter((key) => !["name", "title"].includes(key));
  return (
    <div className="grid gap-4">
      <p className="mb-0 text-xs leading-5 text-[#888]">This projection is available in the graph. Its owning domain detail view is not implemented yet; only authoritative graph metadata is shown.</p>
      <Facts node={node} keys={keys.slice(0, 6)} />
    </div>
  );
}

function Connections({ detail, onNavigateNode }: { detail: GraphNodeDetail; onNavigateNode?: (nodeId: string) => void }) {
  const cache = useQueryClient();
  const announce = useAnnounce();
  const [deleteTarget, setDeleteTarget] = useState<{ edge: EdgeData; label: string } | null>(null);
  const remove = useMutation({
    mutationFn: ({ edge }: { edge: EdgeData; label: string }) => {
      const permission = canDeleteRelationship(edge);
      if (!permission.allowed) throw new Error(permission.message);
      return graphApi.deleteEdge(edge.id, mutationKey("graph_edge_delete"));
    },
    onMutate: ({ label }) => announce(`Removing connection to ${label}.`),
    onSuccess: async (_result, { label }) => {
      setDeleteTarget(null);
      announce(`Connection to ${label} removed.`);
      await cache.invalidateQueries({ queryKey: graphQueryKeys.root });
    },
    onError: (error) => announce(`Connection could not be removed. ${errorMessage(error)}`),
  });

  return (
    <section aria-labelledby="connections-heading">
      <div className="mb-2 flex items-center justify-between"><h3 id="connections-heading" className="mb-0 text-xs font-semibold text-[#F3F5FF]">Connections</h3><span className="font-mono text-[10px] text-[#888]">{detail.connections.length}</span></div>
      {detail.connections.length ? <ul className="grid gap-2">{detail.connections.map(({ edge, node: related, direction }) => {
        const permission = canDeleteRelationship(edge);
        return (
          <li key={edge.id} className="flex items-center gap-2 rounded-lg border border-[#2A2E45] px-3 py-2 text-xs">
            <div className="min-w-0 flex-1">
              {onNavigateNode ? <button type="button" className="break-words text-left text-[#F3F5FF] hover:text-cyan-200" onClick={() => onNavigateNode(related.id)}>{related.label}</button> : <span className="text-[#F3F5FF]">{related.label}</span>}
              <span className="ml-2 text-[#888]">{direction} · {getEdgeTypeDefinition(edge.type).accessibleLabel}</span>
            </div>
            {permission.allowed ? <Button size="icon" variant="ghost" aria-label={`Remove connection to ${related.label}`} onClick={() => setDeleteTarget({ edge, label: related.label })}><Trash2 aria-hidden="true" className="size-3.5" /></Button> : <span className="shrink-0 text-[9px] text-[#666]" title={permission.message}>Source managed</span>}
          </li>
        );
      })}</ul> : <p className="text-xs text-[#888]">No connected entities.</p>}
      <Dialog open={Boolean(deleteTarget)} onClose={() => { if (!remove.isPending) { remove.reset(); setDeleteTarget(null); } }} title="Remove graph connection" description="Only owner-created graph relationships can be removed here.">
        <p className="text-sm text-[#C5C8DB]">Remove the connection to <strong className="text-[#F3F5FF]">{deleteTarget?.label}</strong>?</p>
        {remove.isError ? <p role="alert" className="mt-4 rounded-lg border border-red-400/30 bg-red-400/[0.06] p-3 text-xs text-red-200">Connection removal failed. {errorMessage(remove.error)}</p> : null}
        <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={remove.isPending}>Cancel</Button><Button variant="danger" onClick={() => deleteTarget && remove.mutate(deleteTarget)} disabled={remove.isPending}>{remove.isPending ? "Removing…" : "Remove connection"}</Button></div>
      </Dialog>
    </section>
  );
}

function DetailContent({ detail, adapters, onNavigateNode }: { detail: GraphNodeDetail; adapters?: GraphDomainDetailAdapters; onNavigateNode?: (nodeId: string) => void }) {
  const node = detail.node;
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap gap-2"><Badge variant="cyan">{GRAPH_NODE_TYPE_LABELS[node.type]}</Badge>{node.status ? <Badge>{node.status.replaceAll("_", " ")}</Badge> : null}{node.action ? <Badge variant="purple">{node.action.replaceAll("_", " ")}</Badge> : null}</div>
      {node.summary ? <p className="mb-0 text-sm leading-6 text-[#C5C8DB]">{node.summary}</p> : null}
      {node.type === "hub" ? <HubDetail node={node} /> : null}
      {node.type === "task" ? <TaskDetail node={node} /> : null}
      {node.type === "client" || node.type === "human_contact" ? <CurrentDomainDetail detail={detail} adapter={adapters?.clientContact} onNavigateNode={onNavigateNode} /> : null}
      {!["hub", "task", "client", "human_contact"].includes(node.type) ? <FutureDomainDetail node={node} /> : null}
      <Connections detail={detail} onNavigateNode={onNavigateNode} />
    </div>
  );
}

export function GraphDetailDrawer({ node, open, onClose, adapters, onNavigateNode }: { node: NodeData | null; open: boolean; onClose: () => void; adapters?: GraphDomainDetailAdapters; onNavigateNode?: (nodeId: string) => void }) {
  const query = useQuery({
    queryKey: graphQueryKeys.detail(node?.id ?? "none"),
    queryFn: () => graphApi.detail(node!.id),
    enabled: open && Boolean(node),
    retry: false,
  });
  const fallback: GraphNodeDetail | null = node ? { node, connections: [] } : null;
  const detail = query.data ?? fallback;
  return (
    <Drawer open={open && Boolean(node)} onClose={onClose} title={node?.label ?? "Graph details"} description={node ? `${GRAPH_NODE_TYPE_LABELS[node.type]} graph detail` : undefined}>
      {query.isPending && !query.data ? <p role="status" className="mb-4 text-xs text-[#888]">Loading connected details…</p> : null}
      {query.isError ? <p role="alert" className="mb-4 rounded-lg border border-red-400/20 bg-red-400/5 p-3 text-xs text-red-200">Live detail could not be loaded. Showing available graph data. {errorMessage(query.error)}</p> : null}
      {detail ? <DetailContent detail={detail} adapters={adapters} onNavigateNode={onNavigateNode} /> : null}
    </Drawer>
  );
}
