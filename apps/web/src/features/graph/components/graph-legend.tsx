"use client";

import { useState } from "react";
import { ChevronUp } from "lucide-react";
import type { EdgeData, NodeData } from "@aios/contracts";
import { GRAPH_EDGE_TYPE_LABELS, GRAPH_NODE_TYPE_LABELS, graphEdgeTypes, graphNodeTypes } from "@aios/contracts";
import { getEdgeTypeDefinition, getNodeTypeDefinition } from "@aios/graph";
import { cn } from "@/lib/utils";

export function GraphLegend({ nodes, edges, reducedMotion }: { nodes: readonly NodeData[]; edges: readonly EdgeData[]; reducedMotion: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <section aria-label="Graph legend" className="absolute bottom-3 left-3 z-20 w-[min(22rem,calc(100%-1.5rem))] overflow-hidden rounded-xl border border-[#2A2E45] bg-[#0C1020]/95 shadow-xl backdrop-blur-md">
      <button type="button" className="flex min-h-10 w-full items-center gap-2 px-3 text-left" aria-expanded={open} onClick={() => setOpen((value) => !value)}><span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#C5C8DB]">Legend</span><span className="font-mono text-[10px] text-[#888]">{nodes.length} nodes · {edges.length} edges</span><ChevronUp aria-hidden="true" className={cn("ml-auto size-3 text-[#888] transition-transform", !open && "rotate-180")} /></button>
      {open ? <div className="surface-scrollbar max-h-[min(62vh,32rem)] overflow-y-auto border-t border-[#2A2E45] p-3"><h2 className="mb-2 text-[10px] uppercase tracking-[0.12em] text-[#888]">Node types</h2><ul className="grid grid-cols-2 gap-x-3 gap-y-2">{graphNodeTypes.map((type) => { const visual = getNodeTypeDefinition(type); const count = nodes.filter((node) => node.type === type).length; return <li key={type} className="flex min-w-0 items-center gap-2 text-[10px] text-[#C5C8DB]"><span aria-hidden="true" className="size-2.5 shrink-0 rounded-full border" style={{ borderColor: visual.color, backgroundColor: `${visual.color}33` }} /><span className="truncate">{GRAPH_NODE_TYPE_LABELS[type]}</span><span className="ml-auto font-mono text-[#888]">{count}</span></li>; })}</ul><h2 className="mb-2 mt-4 text-[10px] uppercase tracking-[0.12em] text-[#888]">Edge types</h2><ul className="grid gap-2">{graphEdgeTypes.map((type) => { const visual = getEdgeTypeDefinition(type); const count = edges.filter((edge) => edge.type === type).length; const borderStyle = visual.lineStyle === "solid" ? "solid" : visual.lineStyle; return <li key={type} className="flex items-center gap-2 text-[10px] text-[#C5C8DB]" title={reducedMotion ? visual.reducedMotionDescription : visual.accessibleDescription}><span aria-hidden="true" className={cn("relative h-px w-8 shrink-0 border-t", visual.movingDots && !reducedMotion && "graph-legend-data-flow")} style={{ borderTopStyle: borderStyle, borderTopColor: visual.color === "inherit" ? "#80869F" : visual.color, borderTopWidth: visual.width }} />{GRAPH_EDGE_TYPE_LABELS[type]}<span className="ml-auto font-mono text-[#888]">{count}</span></li>; })}</ul></div> : null}
    </section>
  );
}
