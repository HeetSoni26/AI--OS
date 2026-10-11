"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { select } from "d3-selection";
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from "d3-zoom";
import {
  Bot,
  Brain,
  Building2,
  CircleDollarSign,
  Cog,
  Crown,
  FileText,
  Funnel,
  Gem,
  Lightbulb,
  Megaphone,
  SquareCheckBig,
  User,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { EdgeData, HubKey, NodeData } from "@aios/contracts";
import { getEdgeTypeDefinition, getNodeTypeDefinition, type GraphRenderer } from "@aios/graph";
import { cn } from "@/lib/utils";
import {
  GraphSimulationController,
  edgeEndpointId,
  type PositionedGraphEdge,
  type PositionedGraphNode,
  type SimulationSnapshot,
} from "../lib/simulation-controller";

export type GraphSurfaceHandle = Readonly<{
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  reset: () => void;
  centerNode: (nodeId: string) => void;
}>;

type ContextRequest = Readonly<{ node: NodeData; clientX: number; clientY: number }>;

type GraphSurfaceProps = Readonly<{
  nodes: readonly NodeData[];
  edges: readonly EdgeData[];
  renderer: Exclude<GraphRenderer, "list">;
  opacityById: ReadonlyMap<string, number>;
  selectedIds: ReadonlySet<string>;
  onSelect: (nodeId: string, additive: boolean) => void;
  onOpen: (nodeId: string) => void;
  onContext: (request: ContextRequest) => void;
  onDropNode: (nodeId: string, x: number, y: number) => void;
  reducedMotion: boolean;
}>;

const emptySnapshot: SimulationSnapshot = { nodes: [], edges: [] };
const nodeIcons: Record<Exclude<NodeData["type"], "hub">, LucideIcon> = {
  client: Building2,
  ai_agent: Bot,
  tool: Wrench,
  sop: FileText,
  human_contact: User,
  task: SquareCheckBig,
  decision: Lightbulb,
  knowledge_memory: Brain,
  revenue_finance: CircleDollarSign,
};
const hubIcons: Record<HubKey, LucideIcon> = {
  command: Crown,
  clients: Building2,
  agents: Bot,
  finance: CircleDollarSign,
  pipeline_crm: Funnel,
  content: Megaphone,
  knowledge: Brain,
  automations: Cog,
  tools: Wrench,
};
const canvasGlyphs: Record<NodeData["type"], string> = {
  client: "C",
  ai_agent: "A",
  tool: "T",
  sop: "S",
  human_contact: "H",
  task: "✓",
  decision: "D",
  knowledge_memory: "K",
  revenue_finance: "$",
  hub: "◆",
};

function NodeIcon({ node, color, size }: { node: NodeData; color: string; size: number }) {
  const Icon = node.type === "hub" ? hubIcons[node.metadata.hubKey] ?? Gem : nodeIcons[node.type];
  return <Icon aria-hidden="true" x={-size / 2} y={-size / 2} width={size} height={size} color={color} strokeWidth={node.type === "hub" ? 1.8 : 2} />;
}

function endpoint(edge: PositionedGraphEdge, which: "source" | "target", nodes: readonly PositionedGraphNode[]) {
  const value = edge[which];
  return typeof value === "string" ? nodes.find((node) => node.id === value) : value;
}

function nodeLabel(node: NodeData, connected: number) {
  const parts = [node.label, getNodeTypeDefinition(node.type).label];
  if (node.status) parts.push(`status ${node.status.replaceAll("_", " ")}`);
  if (node.summary) parts.push(node.summary);
  parts.push(`${connected} connected ${connected === 1 ? "entity" : "entities"}`);
  return parts.join(", ");
}

function edgeDash(edge: PositionedGraphEdge) {
  const style = getEdgeTypeDefinition(edge.data.type).lineStyle;
  if (style === "dashed") return "7 6";
  if (style === "dotted") return "2 5";
  return undefined;
}

function edgeColor(edge: PositionedGraphEdge) {
  const color = getEdgeTypeDefinition(edge.data.type).color;
  return color === "inherit" ? "#6C7291" : color;
}

function connectedCount(nodeId: string, edges: readonly PositionedGraphEdge[]) {
  return edges.filter((edge) => edgeEndpointId(edge.source) === nodeId || edgeEndpointId(edge.target) === nodeId).length;
}

function nodeStatusColor(node: NodeData): string | null {
  if (node.type === "ai_agent") {
    return {
      running: "#39FF14",
      idle: "#FFD700",
      error: "#FF4D6D",
      paused: "#808080",
      scheduled: "#B026FF",
    }[node.metadata.status];
  }
  if (!node.action) return null;
  if (node.action === "failed" || node.action === "blocked") return "#FF4D6D";
  if (node.action === "active_running" || node.action === "completed") return "#39FF14";
  return "#FFD700";
}

function directionalNode(current: PositionedGraphNode, nodes: readonly PositionedGraphNode[], key: string) {
  const x = current.x ?? 0;
  const y = current.y ?? 0;
  const candidates = nodes.filter((node) => {
    if (node.id === current.id) return false;
    const dx = (node.x ?? 0) - x;
    const dy = (node.y ?? 0) - y;
    if (key === "ArrowRight") return dx > 0 && Math.abs(dy) <= Math.abs(dx) * 1.5;
    if (key === "ArrowLeft") return dx < 0 && Math.abs(dy) <= Math.abs(dx) * 1.5;
    if (key === "ArrowDown") return dy > 0 && Math.abs(dx) <= Math.abs(dy) * 1.5;
    return dy < 0 && Math.abs(dx) <= Math.abs(dy) * 1.5;
  });
  return candidates.sort((a, b) => Math.hypot((a.x ?? 0) - x, (a.y ?? 0) - y) - Math.hypot((b.x ?? 0) - x, (b.y ?? 0) - y))[0];
}

function nodeKeyDown(event: React.KeyboardEvent<SVGGElement | HTMLButtonElement>, node: PositionedGraphNode, nodes: readonly PositionedGraphNode[], onSelect: GraphSurfaceProps["onSelect"], onOpen: GraphSurfaceProps["onOpen"], onContext: GraphSurfaceProps["onContext"]) {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
    event.preventDefault();
    const next = directionalNode(node, nodes, event.key);
    document.getElementById(`graph-node-${next?.id}`)?.focus();
  } else if (event.key === "Enter") {
    event.preventDefault();
    onOpen(node.id);
  } else if (event.key === " ") {
    event.preventDefault();
    onSelect(node.id, event.shiftKey);
  } else if (event.shiftKey && event.key === "F10") {
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    onContext({ node: node.data, clientX: bounds.left + bounds.width / 2, clientY: bounds.top + bounds.height / 2 });
  }
}

function SvgRenderer({ snapshot, transform, opacityById, selectedIds, reducedMotion, onSelect, onOpen, onContext, controller }: {
  snapshot: SimulationSnapshot;
  transform: ZoomTransform;
  opacityById: ReadonlyMap<string, number>;
  selectedIds: ReadonlySet<string>;
  reducedMotion: boolean;
  onSelect: GraphSurfaceProps["onSelect"];
  onOpen: GraphSurfaceProps["onOpen"];
  onContext: GraphSurfaceProps["onContext"];
  controller: GraphSimulationController;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ node: PositionedGraphNode; x: number; y: number } | null>(null);
  const related = useMemo(() => new Set(snapshot.edges.flatMap((edge) => {
    const source = edgeEndpointId(edge.source);
    const target = edgeEndpointId(edge.target);
    return selectedIds.has(source) || selectedIds.has(target) || hoveredId === source || hoveredId === target ? [source, target] : [];
  })), [hoveredId, selectedIds, snapshot.edges]);
  const showTooltip = (node: PositionedGraphNode, clientX: number, clientY: number, svg: SVGSVGElement | null) => {
    const bounds = svg?.getBoundingClientRect();
    setTooltip({ node, x: clientX - (bounds?.left ?? 0), y: clientY - (bounds?.top ?? 0) });
  };

  const startDrag = (event: React.PointerEvent<SVGGElement>, node: PositionedGraphNode) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    controller.beginDrag(node.id);
    const bounds = target.ownerSVGElement?.getBoundingClientRect();
    const move = (moveEvent: PointerEvent) => controller.drag(node.id, (moveEvent.clientX - (bounds?.left ?? 0) - transform.x) / transform.k, (moveEvent.clientY - (bounds?.top ?? 0) - transform.y) / transform.k);
    const end = () => {
      controller.endDrag(node.id);
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", end);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
  };

  return (
    <svg className="absolute inset-0 size-full overflow-visible" aria-label="Interactive knowledge graph" role="application">
      <defs>
        <filter id="graph-node-glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="4" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        <marker id="graph-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8Z" fill="#FF6B2B" /></marker>
      </defs>
      <g transform={transform.toString()}>
        <g aria-hidden="true">
          {snapshot.edges.map((edge) => {
            const source = endpoint(edge, "source", snapshot.nodes);
            const target = endpoint(edge, "target", snapshot.nodes);
            if (!source || !target) return null;
            const visual = getEdgeTypeDefinition(edge.data.type);
            const highlighted = related.has(source.id) && related.has(target.id);
            const faded = (opacityById.get(source.id) ?? 1) === 0.1 || (opacityById.get(target.id) ?? 1) === 0.1;
            const lineOpacity = highlighted ? 1 : visual.opacity * (faded ? 0.1 : 0.55);
            return <g key={edge.id}><line x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke={edgeColor(edge)} strokeWidth={highlighted ? visual.width + 1.5 : visual.width} strokeDasharray={edgeDash(edge)} opacity={lineOpacity} markerEnd={visual.arrow ? "url(#graph-arrow)" : undefined} className={cn(visual.movingDots && !reducedMotion && "graph-data-flow-edge")}><title>{`${source.data.label} ${visual.accessibleLabel} ${target.data.label}. ${reducedMotion ? visual.reducedMotionDescription : visual.accessibleDescription}`}</title></line>{visual.markerIconKey === "dollar" ? <text x={((source.x ?? 0) + (target.x ?? 0)) / 2} y={((source.y ?? 0) + (target.y ?? 0)) / 2 - 4} fill="#39FF14" fontSize="10" textAnchor="middle" opacity={lineOpacity}>$</text> : null}{visual.movingDots && reducedMotion ? <text x={((source.x ?? 0) + (target.x ?? 0)) / 2} y={((source.y ?? 0) + (target.y ?? 0)) / 2 - 4} fill="#C5C8DB" fontSize="7" textAnchor="middle">data flow</text> : null}</g>;
          })}
        </g>
        <g>
          {snapshot.nodes.map((node) => {
            const visual = getNodeTypeDefinition(node.data.type);
            const selected = selectedIds.has(node.id);
            const opacity = opacityById.get(node.id) ?? 1;
            return (
              <g id={`graph-node-${node.id}`} key={node.id} role="button" tabIndex={0} aria-label={nodeLabel(node.data, connectedCount(node.id, snapshot.edges))} aria-pressed={selected} transform={`translate(${node.x ?? 0},${node.y ?? 0})`} opacity={opacity} className="graph-svg-node cursor-grab focus:outline-none" onPointerDown={(event) => startDrag(event, node)} onClick={(event) => onSelect(node.id, event.shiftKey)} onDoubleClick={(event) => { event.stopPropagation(); onOpen(node.id); }} onContextMenu={(event) => { event.preventDefault(); onContext({ node: node.data, clientX: event.clientX, clientY: event.clientY }); }} onKeyDown={(event) => nodeKeyDown(event, node, snapshot.nodes, onSelect, onOpen, onContext)} onFocus={(event) => { setHoveredId(node.id); const bounds = event.currentTarget.getBoundingClientRect(); showTooltip(node, bounds.left + bounds.width / 2, bounds.top, event.currentTarget.ownerSVGElement); }} onBlur={() => { setHoveredId(null); setTooltip(null); }} onPointerEnter={(event) => { setHoveredId(node.id); showTooltip(node, event.clientX, event.clientY, event.currentTarget.ownerSVGElement); }} onPointerMove={(event) => showTooltip(node, event.clientX, event.clientY, event.currentTarget.ownerSVGElement)} onPointerLeave={(event) => { if (document.activeElement !== event.currentTarget) { setHoveredId(null); setTooltip(null); } }}>
                {selected || related.has(node.id) ? <circle r={visual.radius + (selected ? 8 : 4)} fill="none" stroke={visual.color} strokeWidth={selected ? 2 : 1} opacity={selected ? 0.9 : 0.35} /> : null}
                <circle r={visual.radius} fill="#0C1020" stroke={visual.color} strokeWidth={node.data.type === "hub" ? 2.5 : 1.5} filter={selected ? "url(#graph-node-glow)" : undefined} />
                <NodeIcon node={node.data} color={visual.color} size={Math.max(10, visual.radius * 0.9)} />
                <text aria-hidden="true" y={visual.radius + 14} fill="#F3F5FF" fontFamily="Space Grotesk" fontSize={node.data.type === "hub" ? 11 : 9} fontWeight={node.data.type === "hub" ? 600 : 500} textAnchor="middle" paintOrder="stroke" stroke="#07080F" strokeWidth="3">{node.data.label.length > 26 ? `${node.data.label.slice(0, 24)}…` : node.data.label}</text>
                {nodeStatusColor(node.data) ? <circle aria-hidden="true" cx={visual.radius * 0.72} cy={-visual.radius * 0.72} r="3.5" fill={nodeStatusColor(node.data) ?? undefined} stroke="#07080F" strokeWidth="1.5" /> : null}
              </g>
            );
          })}
        </g>
      </g>
      {tooltip ? <foreignObject aria-hidden="true" x={Math.max(8, tooltip.x + 14)} y={Math.max(tooltip.y - 56, 8)} width="230" height="72" className="pointer-events-none"><div className="graph-tooltip"><strong>{tooltip.node.data.label}</strong><span>{getNodeTypeDefinition(tooltip.node.data.type).label}{tooltip.node.data.status ? ` · ${tooltip.node.data.status.replaceAll("_", " ")}` : ""}</span></div></foreignObject> : null}
    </svg>
  );
}

function CanvasRenderer({ canvasRef, snapshot, transform, opacityById, selectedIds, activeId, reducedMotion }: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  snapshot: SimulationSnapshot;
  transform: ZoomTransform;
  opacityById: ReadonlyMap<string, number>;
  selectedIds: ReadonlySet<string>;
  activeId: string | null;
  reducedMotion: boolean;
}) {
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const bounds = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    let animationFrame = 0;
    const hasMovingData = !reducedMotion && snapshot.edges.some((edge) => getEdgeTypeDefinition(edge.data.type).movingDots);
    canvas.width = Math.max(1, Math.round(bounds.width * ratio));
    canvas.height = Math.max(1, Math.round(bounds.height * ratio));

    const draw = (now: number) => {
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, bounds.width, bounds.height);
      context.save();
      context.translate(transform.x, transform.y);
      context.scale(transform.k, transform.k);
      snapshot.edges.forEach((edge) => {
        const source = endpoint(edge, "source", snapshot.nodes);
        const target = endpoint(edge, "target", snapshot.nodes);
        if (!source || !target) return;
        const visual = getEdgeTypeDefinition(edge.data.type);
        const highlighted = selectedIds.has(source.id) || selectedIds.has(target.id) || activeId === source.id || activeId === target.id;
        context.globalAlpha = highlighted ? 1 : Math.min(opacityById.get(source.id) ?? 1, opacityById.get(target.id) ?? 1) * visual.opacity * 0.55;
        context.strokeStyle = edgeColor(edge);
        context.lineWidth = highlighted ? visual.width + 1.5 : visual.width;
        context.setLineDash(visual.lineStyle === "dashed" ? [7, 6] : visual.lineStyle === "dotted" ? [2, 5] : []);
        context.beginPath(); context.moveTo(source.x ?? 0, source.y ?? 0); context.lineTo(target.x ?? 0, target.y ?? 0); context.stroke();
        if (visual.arrow) {
          const angle = Math.atan2((target.y ?? 0) - (source.y ?? 0), (target.x ?? 0) - (source.x ?? 0));
          const radius = getNodeTypeDefinition(target.data.type).radius + 2;
          const arrowX = (target.x ?? 0) - Math.cos(angle) * radius;
          const arrowY = (target.y ?? 0) - Math.sin(angle) * radius;
          context.save(); context.translate(arrowX, arrowY); context.rotate(angle); context.fillStyle = "#FF6B2B";
          context.beginPath(); context.moveTo(0, 0); context.lineTo(-7, -4); context.lineTo(-7, 4); context.closePath(); context.fill(); context.restore();
        }
        if (visual.markerIconKey === "dollar") {
          context.fillStyle = "#39FF14"; context.font = "10px Space Grotesk"; context.textAlign = "center";
          context.fillText("$", ((source.x ?? 0) + (target.x ?? 0)) / 2, ((source.y ?? 0) + (target.y ?? 0)) / 2 - 4);
        }
        if (visual.movingDots && reducedMotion) {
          context.fillStyle = "#C5C8DB"; context.font = "7px Space Grotesk";
          context.fillText("data flow", ((source.x ?? 0) + (target.x ?? 0)) / 2, ((source.y ?? 0) + (target.y ?? 0)) / 2 - 4);
        } else if (visual.movingDots) {
          const progress = (now % 1_100) / 1_100;
          const x = (source.x ?? 0) + ((target.x ?? 0) - (source.x ?? 0)) * progress;
          const y = (source.y ?? 0) + ((target.y ?? 0) - (source.y ?? 0)) * progress;
          context.beginPath(); context.arc(x, y, 2.5, 0, Math.PI * 2); context.fillStyle = "#C5C8DB"; context.fill();
        }
      });
      context.setLineDash([]);
      snapshot.nodes.forEach((node) => {
        const visual = getNodeTypeDefinition(node.data.type);
        context.globalAlpha = opacityById.get(node.id) ?? 1;
        if (activeId === node.id || selectedIds.has(node.id)) {
          context.beginPath(); context.arc(node.x ?? 0, node.y ?? 0, visual.radius + (selectedIds.has(node.id) ? 8 : 4), 0, Math.PI * 2);
          context.strokeStyle = visual.color; context.lineWidth = selectedIds.has(node.id) ? 2 : 1; context.stroke();
        }
        context.beginPath(); context.arc(node.x ?? 0, node.y ?? 0, visual.radius, 0, Math.PI * 2); context.fillStyle = "#0C1020"; context.fill(); context.strokeStyle = visual.color; context.lineWidth = selectedIds.has(node.id) ? 3 : node.data.type === "hub" ? 2.5 : 1.5; context.stroke();
        context.fillStyle = visual.color; context.textAlign = "center"; context.textBaseline = "middle"; context.font = `700 ${Math.max(8, visual.radius * 0.65)}px Space Grotesk`; context.fillText(canvasGlyphs[node.data.type], node.x ?? 0, node.y ?? 0);
        context.fillStyle = "#F3F5FF"; context.font = `${node.data.type === "hub" ? 600 : 500} ${node.data.type === "hub" ? 11 : 9}px Space Grotesk`; context.fillText(node.data.label.length > 26 ? `${node.data.label.slice(0, 24)}…` : node.data.label, node.x ?? 0, (node.y ?? 0) + visual.radius + 14);
        const statusColor = nodeStatusColor(node.data);
        if (statusColor) {
          context.beginPath(); context.arc((node.x ?? 0) + visual.radius * 0.72, (node.y ?? 0) - visual.radius * 0.72, 3.5, 0, Math.PI * 2);
          context.fillStyle = statusColor; context.fill(); context.strokeStyle = "#07080F"; context.lineWidth = 1.5; context.stroke();
        }
      });
      context.restore();
      context.globalAlpha = 1;
      if (hasMovingData) animationFrame = requestAnimationFrame(draw);
    };

    draw(performance.now());
    return () => cancelAnimationFrame(animationFrame);
  }, [activeId, canvasRef, opacityById, reducedMotion, selectedIds, snapshot, transform]);
  return <canvas ref={canvasRef} className="absolute inset-0 size-full" aria-hidden="true" />;
}

export const GraphSurface = forwardRef<GraphSurfaceHandle, GraphSurfaceProps>(function GraphSurface({ nodes, edges, renderer, opacityById, selectedIds, onSelect, onOpen, onContext, onDropNode, reducedMotion }, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const behaviorRef = useRef<ZoomBehavior<HTMLDivElement, unknown> | null>(null);
  const controllerRef = useRef<GraphSimulationController | null>(null);
  if (!controllerRef.current) controllerRef.current = new GraphSimulationController();
  const controller = controllerRef.current;
  const [snapshot, setSnapshot] = useState<SimulationSnapshot>(emptySnapshot);
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [canvasHoverId, setCanvasHoverId] = useState<string | null>(null);
  const [canvasTooltip, setCanvasTooltip] = useState<{ node: PositionedGraphNode; x: number; y: number } | null>(null);
  const activeCanvasId = canvasHoverId ?? focusedId;

  useEffect(() => controller.subscribe(setSnapshot), [controller]);
  useEffect(() => () => controller.destroy(), [controller]);
  useEffect(() => controller.reconcile(nodes, edges), [controller, edges, nodes]);
  useEffect(() => controller.setReducedMotion(reducedMotion), [controller, reducedMotion]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => entry && controller.resize(entry.contentRect.width, entry.contentRect.height));
    observer.observe(host);
    const behavior = zoom<HTMLDivElement, unknown>().scaleExtent([0.1, 4]).filter((event) => event.type !== "dblclick").on("zoom", (event) => setTransform(event.transform));
    behaviorRef.current = behavior;
    select(host).call(behavior);
    return () => { observer.disconnect(); select(host).on(".zoom", null); };
  }, [controller]);

  const animateTransform = useCallback((next: ZoomTransform) => {
    const host = hostRef.current;
    const behavior = behaviorRef.current;
    if (!host || !behavior) return;
    const selection = select(host);
    if (reducedMotion) behavior.transform(selection, next); else behavior.transform(selection.transition().duration(260), next);
  }, [reducedMotion]);

  const fit = useCallback(() => {
    const host = hostRef.current;
    if (!host || snapshot.nodes.length === 0) return animateTransform(zoomIdentity);
    const bounds = host.getBoundingClientRect();
    const xs = snapshot.nodes.map((node) => node.x ?? bounds.width / 2);
    const ys = snapshot.nodes.map((node) => node.y ?? bounds.height / 2);
    const minX = Math.min(...xs) - 56; const maxX = Math.max(...xs) + 56; const minY = Math.min(...ys) - 56; const maxY = Math.max(...ys) + 56;
    const scale = Math.max(0.1, Math.min(4, 0.88 / Math.max((maxX - minX) / bounds.width, (maxY - minY) / bounds.height)));
    animateTransform(zoomIdentity.translate(bounds.width / 2 - scale * (minX + maxX) / 2, bounds.height / 2 - scale * (minY + maxY) / 2).scale(scale));
  }, [animateTransform, snapshot.nodes]);

  const centerNode = useCallback((nodeId: string) => {
    const host = hostRef.current;
    const node = snapshot.nodes.find((entry) => entry.id === nodeId);
    if (!host || !node) return;
    const bounds = host.getBoundingClientRect();
    animateTransform(zoomIdentity.translate(bounds.width / 2 - transform.k * (node.x ?? 0), bounds.height / 2 - transform.k * (node.y ?? 0)).scale(transform.k));
    document.getElementById(`graph-node-${nodeId}`)?.focus();
  }, [animateTransform, snapshot.nodes, transform.k]);

  useImperativeHandle(ref, () => ({
    zoomIn: () => { const host = hostRef.current; const behavior = behaviorRef.current; if (host && behavior) behavior.scaleBy(select(host), 1.3); },
    zoomOut: () => { const host = hostRef.current; const behavior = behaviorRef.current; if (host && behavior) behavior.scaleBy(select(host), 1 / 1.3); },
    fit,
    reset: () => animateTransform(zoomIdentity),
    centerNode,
  }), [animateTransform, centerNode, fit]);

  const hitNode = useCallback((clientX: number, clientY: number) => {
    const bounds = hostRef.current?.getBoundingClientRect();
    if (!bounds) return undefined;
    const graphX = (clientX - bounds.left - transform.x) / transform.k;
    const graphY = (clientY - bounds.top - transform.y) / transform.k;
    return snapshot.nodes.find((node) => Math.hypot((node.x ?? 0) - graphX, (node.y ?? 0) - graphY) <= getNodeTypeDefinition(node.data.type).radius + 5);
  }, [snapshot.nodes, transform]);

  const canvasPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (renderer !== "canvas" || event.button !== 0) return;
    const node = hitNode(event.clientX, event.clientY);
    if (!node) return;
    event.stopPropagation();
    controller.beginDrag(node.id);
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const bounds = hostRef.current!.getBoundingClientRect();
    const move = (moveEvent: PointerEvent) => controller.drag(node.id, (moveEvent.clientX - bounds.left - transform.x) / transform.k, (moveEvent.clientY - bounds.top - transform.y) / transform.k);
    const end = (endEvent: PointerEvent) => {
      controller.endDrag(node.id);
      if (Math.hypot(endEvent.clientX - event.clientX, endEvent.clientY - event.clientY) < 5) onSelect(node.id, endEvent.shiftKey);
      target.removeEventListener("pointermove", move); target.removeEventListener("pointerup", end); target.removeEventListener("pointercancel", end);
    };
    target.addEventListener("pointermove", move); target.addEventListener("pointerup", end); target.addEventListener("pointercancel", end);
  };

  return (
    <div ref={hostRef} data-testid="graph-surface" data-renderer={renderer} className="graph-surface app-grid absolute inset-0 overflow-hidden touch-none" onDoubleClick={(event) => { if (renderer === "canvas") { const node = hitNode(event.clientX, event.clientY); if (node) { onOpen(node.id); return; } } fit(); }} onContextMenu={(event) => { if (renderer !== "canvas") return; const node = hitNode(event.clientX, event.clientY); if (node) { event.preventDefault(); onContext({ node: node.data, clientX: event.clientX, clientY: event.clientY }); } }} onPointerMove={(event) => { if (renderer !== "canvas") return; const node = hitNode(event.clientX, event.clientY); const bounds = hostRef.current?.getBoundingClientRect(); setCanvasHoverId(node?.id ?? null); setCanvasTooltip(node && bounds ? { node, x: event.clientX - bounds.left, y: event.clientY - bounds.top } : focusedId ? canvasTooltip : null); }} onPointerLeave={() => { setCanvasHoverId(null); if (!focusedId) setCanvasTooltip(null); }} onPointerDown={canvasPointerDown} onDragOver={(event) => { if (event.dataTransfer.types.includes("application/x-aios-graph-node")) event.preventDefault(); }} onDrop={(event) => { const id = event.dataTransfer.getData("application/x-aios-graph-node"); const bounds = hostRef.current?.getBoundingClientRect(); if (id && bounds) { event.preventDefault(); onDropNode(id, (event.clientX - bounds.left - transform.x) / transform.k, (event.clientY - bounds.top - transform.y) / transform.k); controller.beginDrag(id); controller.drag(id, (event.clientX - bounds.left - transform.x) / transform.k, (event.clientY - bounds.top - transform.y) / transform.k); controller.endDrag(id); } }}>
      {renderer === "svg" ? <SvgRenderer snapshot={snapshot} transform={transform} opacityById={opacityById} selectedIds={selectedIds} reducedMotion={reducedMotion} onSelect={onSelect} onOpen={onOpen} onContext={onContext} controller={controller} /> : <CanvasRenderer canvasRef={canvasRef} snapshot={snapshot} transform={transform} opacityById={opacityById} selectedIds={selectedIds} activeId={activeCanvasId} reducedMotion={reducedMotion} />}
      {renderer === "canvas" ? <div className="sr-only" role="group" aria-label="Accessible graph nodes">{snapshot.nodes.map((node) => <button id={`graph-node-${node.id}`} key={node.id} type="button" aria-pressed={selectedIds.has(node.id)} aria-label={nodeLabel(node.data, connectedCount(node.id, snapshot.edges))} onFocus={() => { setFocusedId(node.id); setCanvasTooltip({ node, x: transform.x + (node.x ?? 0) * transform.k, y: transform.y + (node.y ?? 0) * transform.k }); }} onBlur={() => { setFocusedId(null); if (!canvasHoverId) setCanvasTooltip(null); }} tabIndex={focusedId === null || focusedId === node.id ? 0 : -1} onClick={(event) => onSelect(node.id, event.shiftKey)} onDoubleClick={() => onOpen(node.id)} onContextMenu={(event) => { event.preventDefault(); onContext({ node: node.data, clientX: event.clientX, clientY: event.clientY }); }} onKeyDown={(event) => nodeKeyDown(event, node, snapshot.nodes, onSelect, onOpen, onContext)}>{node.data.label}</button>)}</div> : null}
      {renderer === "canvas" && canvasTooltip ? <div aria-hidden="true" className="graph-tooltip pointer-events-none absolute z-10 w-[230px]" style={{ left: Math.max(8, canvasTooltip.x + 14), top: Math.max(8, canvasTooltip.y - 56) }}><strong>{canvasTooltip.node.data.label}</strong><span>{getNodeTypeDefinition(canvasTooltip.node.data.type).label}{canvasTooltip.node.data.status ? ` · ${canvasTooltip.node.data.status.replaceAll("_", " ")}` : ""}</span></div> : null}
      <div className="pointer-events-none absolute right-3 top-3 rounded-md border border-[#2A2E45] bg-[#0C1020]/80 px-2 py-1 font-mono text-[10px] text-[#888]" aria-hidden="true">{Math.round(transform.k * 100)}%</div>
    </div>
  );
});
